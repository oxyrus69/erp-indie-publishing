import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import { bookProjects, invoices, orders, packages, productionTasks } from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import { finalizeTableQuery, parseTableQuery } from '$lib/table/query';
import { PROJECT_STATUS } from '$lib/ui';
import type { PageServerLoad } from './$types';

const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;

/**
 * Kolom yang boleh dipakai mengurutkan, dipetakan ke ekspresi SQL.
 * Hanya nama di peta ini yang bisa masuk query — parameter URL tidak pernah
 * digabung langsung ke SQL.
 */
const SORTABLE = {
	title: bookProjects.title,
	author: bookProjects.authorName,
	order: orders.orderNumber,
	created: orders.createdAt,
	updated: bookProjects.updatedAt,
	total: orders.totalAmount,
	status: bookProjects.status
} as const;

const ATTENTION = ['OVERDUE', 'UNPAID'] as const;

/**
 * Daftar proyek buku.
 *
 * Penyaringan, pengurutan, dan pemotongan halaman dilakukan di database.
 * Halaman tidak lagi menarik seluruh tabel lalu menyaring di peramban, jadi
 * waktu muat tetap datar meski jumlah kontrak bertambah.
 *
 * Tiga agregat (pembayaran, sisa tagihan, progres task) dihitung dengan
 * subquery korelasi, sehingga satu halaman hanya mengambil baris yang tampil.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
		error(403, 'Akses ditolak.');
	}

	const statusValues = Object.keys(PROJECT_STATUS);
	const parsed = parseTableQuery(url, {
		sortable: Object.keys(SORTABLE),
		defaultSort: 'created',
		defaultDir: 'desc',
		filterOptions: {
			status: statusValues,
			attention: ['1']
		}
	});

	const conditions: SQL[] = [];

	if (parsed.filters.status) {
		conditions.push(eq(bookProjects.status, parsed.filters.status as typeof statusValues[number] as never));
	}
	if (parsed.filters.attention === '1') {
		// "Perlu tindakan" = ada invoice jatuh tempo/belum lunas, atau task lewat tenggat.
		conditions.push(
			sql`(
				exists (
					select 1 from ${invoices}
					where ${invoices.orderId} = ${orders.id}
						and ${invoices.status} <> 'VOID'
						and ${invoices.status} <> 'PAID'
						and (
							${invoices.status} = 'OVERDUE'
							or (${invoices.dueDate} is not null and ${invoices.dueDate} < current_date)
						)
				)
				or exists (
					select 1 from ${productionTasks}
					where ${productionTasks.projectId} = ${bookProjects.id}
						and ${productionTasks.deadline} is not null
						and ${productionTasks.deadline} < current_date
						and ${productionTasks.status} not in ('COMPLETED', 'CANCELLED')
				)
			)`
		);
	}
	if (parsed.q) {
		const pattern = `%${parsed.q}%`;
		const search = or(
			ilike(bookProjects.title, pattern),
			ilike(bookProjects.authorName, pattern),
			ilike(orders.orderNumber, pattern),
			ilike(bookProjects.genre, pattern),
			ilike(bookProjects.isbn, pattern)
		);
		if (search) conditions.push(search);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const sortColumn = SORTABLE[parsed.sort as keyof typeof SORTABLE] ?? SORTABLE.created;
	const orderBy = parsed.dir === 'asc' ? asc(sortColumn) : desc(sortColumn);

	const base = db
		.select({
			id: bookProjects.id,
			title: bookProjects.title,
			subtitle: bookProjects.subtitle,
			authorName: bookProjects.authorName,
			genre: bookProjects.genre,
			status: bookProjects.status,
			pageCount: bookProjects.pageCount,
			editorialStage: bookProjects.editorialStage,
			coverStage: bookProjects.coverStage,
			legalStage: bookProjects.legalStage,
			printStage: bookProjects.printStage,
			isbn: bookProjects.isbn,
			updatedAt: bookProjects.updatedAt,
			orderId: orders.id,
			orderNumber: orders.orderNumber,
			totalAmount: orders.totalAmount,
			packageName: packages.name,
			createdAt: orders.createdAt,
			/** Terbayar untuk order ini (invoice non-VOID). */
			paid: sql<string>`coalesce((
				select sum(${invoices.paidAmount}) from ${invoices}
				where ${invoices.orderId} = ${orders.id} and ${invoices.status} <> 'VOID'
			), 0)`,
			/** Total tertagih. */
			billed: sql<string>`coalesce((
				select sum(${invoices.amount}) from ${invoices}
				where ${invoices.orderId} = ${orders.id} and ${invoices.status} <> 'VOID'
			), 0)`,
			/** Sisa tagihan yang belum dibayar. */
			outstanding: sql<string>`coalesce((
				select sum(greatest(${invoices.amount} - ${invoices.paidAmount}, 0)) from ${invoices}
				where ${invoices.orderId} = ${orders.id}
					and ${invoices.status} <> 'VOID' and ${invoices.status} <> 'PAID'
			), 0)`,
			hasOverdueInvoice: sql<boolean>`exists (
				select 1 from ${invoices}
				where ${invoices.orderId} = ${orders.id}
					and ${invoices.status} <> 'VOID' and ${invoices.status} <> 'PAID'
					and (${invoices.status} = 'OVERDUE'
						or (${invoices.dueDate} is not null and ${invoices.dueDate} < current_date))
			)`,
			taskTotal: sql<number>`(select count(*)::int from ${productionTasks} where ${productionTasks.projectId} = ${bookProjects.id})`,
			taskDone: sql<number>`(select count(*)::int from ${productionTasks}
				where ${productionTasks.projectId} = ${bookProjects.id} and ${productionTasks.status} = 'COMPLETED')`,
			tasksInReview: sql<number>`(select count(*)::int from ${productionTasks}
				where ${productionTasks.projectId} = ${bookProjects.id} and ${productionTasks.status} = 'WAITING_AUTHOR_REVIEW')`,
			overdueTasks: sql<number>`(select count(*)::int from ${productionTasks}
				where ${productionTasks.projectId} = ${bookProjects.id}
					and ${productionTasks.deadline} is not null
					and ${productionTasks.deadline} < current_date
					and ${productionTasks.status} not in ('COMPLETED', 'CANCELLED'))`
		})
		.from(bookProjects)
		.innerJoin(orders, eq(orders.id, bookProjects.orderId))
		.innerJoin(packages, eq(packages.id, orders.packageId));

	const [rows, countRows] = await Promise.all([
		base
			.where(where)
			.orderBy(orderBy, asc(bookProjects.id))
			.limit(parsed.size)
			.offset((parsed.page - 1) * parsed.size),
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(bookProjects)
			.innerJoin(orders, eq(orders.id, bookProjects.orderId))
			.innerJoin(packages, eq(packages.id, orders.packageId))
			.where(where)
	]);

	const total = countRows[0]?.total ?? 0;
	const query = finalizeTableQuery(parsed, total);

	/*
	 * Angka ringkasan dihitung terpisah dari halaman yang tampil: KPI tidak boleh
	 * berubah hanya karena pengguna berpindah halaman atau menyaring daftar.
	 */
	const [kpiRows, statusRows] = await Promise.all([
		db
			.select({
				totalProjects: sql<number>`count(*)::int`,
				active: sql<number>`count(*) filter (where ${bookProjects.status} in ('INITIATED','IN_PRODUCTION','AWAITING_AUTHOR','READY_FOR_PRINT','IN_PRINTING'))::int`,
				awaitingAuthor: sql<number>`count(*) filter (where ${bookProjects.status} = 'AWAITING_AUTHOR')::int`,
				published: sql<number>`count(*) filter (where ${bookProjects.status} in ('PUBLISHED','COMPLETED'))::int`
			})
			.from(bookProjects),
		db
			.select({ status: bookProjects.status, count: sql<number>`count(*)::int` })
			.from(bookProjects)
			.groupBy(bookProjects.status)
	]);

	const kpi = kpiRows[0] ?? {
		totalProjects: 0,
		active: 0,
		awaitingAuthor: 0,
		published: 0
	};

	const [moneyRows, reviewRows, attentionRows] = await Promise.all([
		db
			.select({
				receivable: sql<string>`coalesce(sum(greatest(${invoices.amount} - ${invoices.paidAmount}, 0)), 0)`
			})
			.from(invoices)
			.where(and(sql`${invoices.status} <> 'VOID'`, sql`${invoices.status} <> 'PAID'`)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(productionTasks)
			.where(eq(productionTasks.status, 'WAITING_AUTHOR_REVIEW')),
		db
			.select({ count: sql<number>`count(distinct ${bookProjects.id})::int` })
			.from(bookProjects)
			.innerJoin(orders, eq(orders.id, bookProjects.orderId))
			.where(
				sql`exists (
					select 1 from ${invoices}
					where ${invoices.orderId} = ${orders.id}
						and ${invoices.status} <> 'VOID' and ${invoices.status} <> 'PAID'
						and (${invoices.status} = 'OVERDUE'
							or (${invoices.dueDate} is not null and ${invoices.dueDate} < current_date))
				) or exists (
					select 1 from ${productionTasks}
					where ${productionTasks.projectId} = ${bookProjects.id}
						and ${productionTasks.deadline} is not null
						and ${productionTasks.deadline} < current_date
						and ${productionTasks.status} not in ('COMPLETED','CANCELLED')
				)`
			)
	]);

	return {
		projects: rows.map((row) => ({
			...row,
			paidNum: toNumber(row.paid),
			billedNum: toNumber(row.billed),
			outstandingNum: toNumber(row.outstanding),
			paidPct:
				toNumber(row.billed) > 0
					? Math.min(100, Math.round((toNumber(row.paid) / toNumber(row.billed)) * 100))
					: 0
		})),
		query,
		kpi: {
			...kpi,
			receivable: toNumber(moneyRows[0]?.receivable),
			inReview: reviewRows[0]?.count ?? 0,
			needsAttention: attentionRows[0]?.count ?? 0
		},
		countByStatus: Object.fromEntries(statusRows.map((row) => [row.status, row.count]))
	};
};
