import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import { bookProjects, invoices, orders, packages, profiles, withdrawalRequests } from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import { parseTableQuery } from '$lib/table/query';
import { parsePeriod } from '$lib/table/period';
import { INVOICE_KIND, INVOICE_STATUS } from '$lib/ui';
import type { RequestHandler } from './$types';

const FINANCE_ROLES = ['SUPER_ADMIN', 'FINANCE'] as const;
const WITHDRAWAL_STATUSES = ['REQUESTED', 'APPROVED', 'PAID', 'REJECTED'] as const;

/**
 * Ekspor CSV untuk pembukuan.
 *
 * File mengikuti filter yang sedang aktif di layar, sehingga angka di Excel
 * sama dengan yang dilihat saat mengunduh. Tidak ada pemotongan halaman:
 * ekspor selalu berisi seluruh hasil filter.
 *
 * Dipakai `;` sebagai pemisah karena Excel berlokal Indonesia memperlakukan
 * koma sebagai desimal. BOM UTF-8 ditambahkan supaya huruf beraksen dan
 * "Rp" tidak berubah jadi mojibake.
 */

/** Membungkus satu sel: kutip bila mengandung pemisah, kutip, atau baris baru. */
function cell(value: unknown): string {
	if (value === null || value === undefined) return '';
	const text = String(value);
	return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
	const lines = [headers.map(cell).join(';'), ...rows.map((row) => row.map(cell).join(';'))];
	return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Angka untuk spreadsheet: tanpa pemisah ribuan, titik desimal. */
function num(value: unknown): string {
	return toNumber(value as string | number).toFixed(2).replace('.', ',');
}

function csvResponse(body: string, filename: string): Response {
	return new Response(body, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
		error(403, 'Hanya tim keuangan yang dapat mengunduh rekap.');
	}

	const tab = url.searchParams.get('tab') === 'payables' ? 'payables' : 'receivables';
	const stamp = new Date().toISOString().slice(0, 10);

	/* Periode yang sama dengan layar: ekspor harus menjawab pertanyaan yang
	   sama dengan yang sedang dilihat, bukan seluruh riwayat. */
	const period = parsePeriod(url);

	if (tab === 'receivables') {
		const query = parseTableQuery(url, {
			sortable: ['due', 'number', 'amount', 'created', 'status'],
			defaultSort: 'due',
			defaultDir: 'asc',
			filterOptions: {
				status: Object.keys(INVOICE_STATUS),
				bucket: ['overdue', 'dueSoon', 'notDue'],
				kind: ['DOWN_PAYMENT', 'FINAL_SETTLEMENT', 'EXTRA_REVISION', 'ADDON_SERVICE', 'PRINT_ADDON']
			}
		});

		const conditions: SQL[] = [sql`${invoices.status} <> 'VOID'`];
		if (query.filters.status) {
			conditions.push(eq(invoices.status, query.filters.status as never));
		} else {
			conditions.push(sql`${invoices.status} <> 'PAID'`);
		}
		if (query.filters.kind) conditions.push(eq(invoices.kind, query.filters.kind as never));
		if (query.filters.bucket === 'overdue') {
			conditions.push(
				sql`(${invoices.status} = 'OVERDUE' or (${invoices.dueDate} is not null and ${invoices.dueDate} < current_date))`
			);
		} else if (query.filters.bucket === 'dueSoon') {
			conditions.push(
				sql`${invoices.status} <> 'OVERDUE' and ${invoices.dueDate} between current_date and current_date + 7`
			);
		} else if (query.filters.bucket === 'notDue') {
			conditions.push(
				sql`${invoices.status} <> 'OVERDUE' and (${invoices.dueDate} is null or ${invoices.dueDate} > current_date + 7)`
			);
		}
		if (query.q) {
			const pattern = `%${query.q}%`;
			const search = or(
				ilike(invoices.invoiceNumber, pattern),
				ilike(orders.orderNumber, pattern),
				ilike(bookProjects.title, pattern),
				ilike(bookProjects.authorName, pattern)
			);
			if (search) conditions.push(search);
		}
		if (period.from) conditions.push(sql`${invoices.createdAt} >= ${period.from}::date`);
		if (period.to) {
			conditions.push(sql`${invoices.createdAt} < (${period.to}::date + interval '1 day')`);
		}

		const sortMap = {
			due: invoices.dueDate,
			number: invoices.invoiceNumber,
			amount: invoices.amount,
			created: invoices.createdAt,
			status: invoices.status
		} as const;
		const sortColumn = sortMap[query.sort as keyof typeof sortMap] ?? sortMap.due;

		const rows = await db
			.select({
				invoiceNumber: invoices.invoiceNumber,
				kind: invoices.kind,
				status: invoices.status,
				orderNumber: orders.orderNumber,
				projectTitle: bookProjects.title,
				authorName: bookProjects.authorName,
				packageName: packages.name,
				amount: invoices.amount,
				paidAmount: invoices.paidAmount,
				dueDate: invoices.dueDate,
				paidAt: invoices.paidAt
			})
			.from(invoices)
			.innerJoin(orders, eq(orders.id, invoices.orderId))
			.innerJoin(packages, eq(packages.id, orders.packageId))
			.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
			.where(and(...conditions))
			.orderBy(query.dir === 'asc' ? asc(sortColumn) : desc(sortColumn));

		const csv = toCsv(
			[
				'Nomor Invoice',
				'Jenis',
				'Status',
				'Nomor Order',
				'Judul Buku',
				'Penulis',
				'Paket',
				'Nominal',
				'Sudah Dibayar',
				'Sisa',
				'Jatuh Tempo',
				'Tanggal Lunas'
			],
			rows.map((row) => [
				row.invoiceNumber,
				INVOICE_KIND[row.kind] ?? row.kind,
				INVOICE_STATUS[row.status]?.label ?? row.status,
				row.orderNumber,
				row.projectTitle ?? '',
				row.authorName ?? '',
				row.packageName,
				num(row.amount),
				num(row.paidAmount),
				num(Math.max(0, toNumber(row.amount) - toNumber(row.paidAmount))),
				row.dueDate ?? '',
				row.paidAt ? new Date(row.paidAt).toISOString().slice(0, 10) : ''
			])
		);

		return csvResponse(csv, `rekap-piutang-${stamp}.csv`);
	}

	/* -------------------------------- Kewajiban ------------------------------- */
	const query = parseTableQuery(url, {
		sortable: ['created', 'amount', 'status', 'user'],
		defaultSort: 'created',
		defaultDir: 'desc',
		filterOptions: { status: [...WITHDRAWAL_STATUSES] }
	});

	const conditions: SQL[] = [];
	if (query.filters.status) {
		conditions.push(eq(withdrawalRequests.status, query.filters.status as never));
	}
	if (query.q) {
		const pattern = `%${query.q}%`;
		const search = or(
			ilike(profiles.fullName, pattern),
			ilike(withdrawalRequests.bankName, pattern),
			ilike(withdrawalRequests.bankAccountNumber, pattern)
		);
		if (search) conditions.push(search);
	}
	if (period.from) {
		conditions.push(sql`${withdrawalRequests.createdAt} >= ${period.from}::date`);
	}
	if (period.to) {
		conditions.push(sql`${withdrawalRequests.createdAt} < (${period.to}::date + interval '1 day')`);
	}

	const sortMap = {
		created: withdrawalRequests.createdAt,
		amount: withdrawalRequests.amount,
		status: withdrawalRequests.status,
		user: profiles.fullName
	} as const;
	const sortColumn = sortMap[query.sort as keyof typeof sortMap] ?? sortMap.created;

	const rows = await db
		.select({
			userName: profiles.fullName,
			userRole: profiles.role,
			wallet: withdrawalRequests.wallet,
			amount: withdrawalRequests.amount,
			status: withdrawalRequests.status,
			bankName: withdrawalRequests.bankName,
			bankAccountName: withdrawalRequests.bankAccountName,
			bankAccountNumber: withdrawalRequests.bankAccountNumber,
			note: withdrawalRequests.note,
			createdAt: withdrawalRequests.createdAt,
			processedAt: withdrawalRequests.processedAt
		})
		.from(withdrawalRequests)
		.innerJoin(profiles, eq(profiles.id, withdrawalRequests.userId))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(query.dir === 'asc' ? asc(sortColumn) : desc(sortColumn));

	const csv = toCsv(
		[
			'Penerima',
			'Peran',
			'Dompet',
			'Nominal',
			'Status',
			'Bank',
			'Atas Nama',
			'No. Rekening',
			'Catatan',
			'Diminta',
			'Diproses'
		],
		rows.map((row) => [
			row.userName,
			row.userRole,
			row.wallet === 'ROYALTY' ? 'Royalti Penulis' : 'Komisi Freelancer',
			num(row.amount),
			row.status,
			row.bankName ?? '',
			row.bankAccountName ?? '',
			row.bankAccountNumber ?? '',
			row.note ?? '',
			new Date(row.createdAt).toISOString().slice(0, 10),
			row.processedAt ? new Date(row.processedAt).toISOString().slice(0, 10) : ''
		])
	);

	return csvResponse(csv, `rekap-kewajiban-${stamp}.csv`);
};
