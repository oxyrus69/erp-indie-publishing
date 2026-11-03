import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	freelancerLedgers,
	invoicePayments,
	invoices,
	orders,
	packages,
	printRuns,
	profiles,
	royaltyLedgers,
	withdrawalRequests
} from '$db/schema';
import { handleInvoicePaid, processWithdrawal } from '$lib/server/services/erpEngine';
import { readRequestId, runIdempotent } from '$lib/server/services/idempotency';
import { audit } from '$lib/server/services/auditDraft';
import { ErpError } from '$lib/server/services/erpErrors';
import { toNumber } from '$lib/server/services/money';
import { loadAnalytics } from '$lib/server/services/analytics';
import { finalizeTableQuery, parseTableQuery } from '$lib/table/query';
import { parsePeriod, quickPeriods } from '$lib/table/period';
import { INVOICE_STATUS } from '$lib/ui';
import type { Actions, PageServerLoad } from './$types';

const FINANCE_ROLES = ['SUPER_ADMIN', 'FINANCE'] as const;
const WITHDRAWAL_STATUSES = ['REQUESTED', 'APPROVED', 'PAID', 'REJECTED'] as const;

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/** Selisih hari terhadap hari ini; negatif berarti sudah lewat jatuh tempo. */
function daysUntil(date: string | Date | null): number | null {
	if (!date) return null;
	const target = typeof date === 'string' ? new Date(date) : date;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const d = new Date(target);
	d.setHours(0, 0, 0, 0);
	return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Kolom pengurutan piutang: nama logis → ekspresi SQL. */
const INVOICE_SORT = {
	due: invoices.dueDate,
	number: invoices.invoiceNumber,
	amount: invoices.amount,
	created: invoices.createdAt,
	status: invoices.status
} as const;

/** Kolom pengurutan penarikan: nama logis → ekspresi SQL. */
const WITHDRAWAL_SORT = {
	created: withdrawalRequests.createdAt,
	amount: withdrawalRequests.amount,
	status: withdrawalRequests.status,
	user: profiles.fullName
} as const;

/**
 * Buku kas & kewajiban.
 *
 * Semua angka diturunkan dari invoice dan ledger berjalan — tidak ada kolom
 * cache — sehingga selalu konsisten dengan halaman proyek.
 *
 * Daftar piutang dan penarikan disaring, diurutkan, dan dipotong di server:
 * halaman tidak lagi menarik seluruh tabel invoice lalu menyaringnya di
 * peramban.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
		error(403, 'Hanya tim keuangan yang dapat membuka halaman ini.');
	}

	const tabParam = url.searchParams.get('tab');
	const tab = tabParam === 'payables' || tabParam === 'cash' ? tabParam : 'receivables';
	const period = parsePeriod(url);

	/* --------------------------------- Piutang -------------------------------- */
	const invoiceQuery = parseTableQuery(url, {
		sortable: Object.keys(INVOICE_SORT),
		defaultSort: 'due',
		defaultDir: 'asc',
		filterOptions: {
			status: Object.keys(INVOICE_STATUS),
			bucket: ['overdue', 'dueSoon', 'notDue'],
			kind: ['DOWN_PAYMENT', 'FINAL_SETTLEMENT', 'EXTRA_REVISION', 'ADDON_SERVICE', 'PRINT_ADDON']
		}
	});

	const invoiceConditions: SQL[] = [sql`${invoices.status} <> 'VOID'`];

	if (invoiceQuery.filters.status) {
		invoiceConditions.push(eq(invoices.status, invoiceQuery.filters.status as never));
	} else {
		// Tab piutang default: hanya yang masih terbuka.
		invoiceConditions.push(sql`${invoices.status} <> 'PAID'`);
	}
	if (invoiceQuery.filters.kind) {
		invoiceConditions.push(eq(invoices.kind, invoiceQuery.filters.kind as never));
	}
	if (invoiceQuery.filters.bucket === 'overdue') {
		invoiceConditions.push(
			sql`(${invoices.status} = 'OVERDUE' or (${invoices.dueDate} is not null and ${invoices.dueDate} < current_date))`
		);
	} else if (invoiceQuery.filters.bucket === 'dueSoon') {
		invoiceConditions.push(
			sql`${invoices.status} <> 'OVERDUE' and ${invoices.dueDate} between current_date and current_date + 7`
		);
	} else if (invoiceQuery.filters.bucket === 'notDue') {
		invoiceConditions.push(
			sql`${invoices.status} <> 'OVERDUE' and (${invoices.dueDate} is null or ${invoices.dueDate} > current_date + 7)`
		);
	}
	if (invoiceQuery.q) {
		const pattern = `%${invoiceQuery.q}%`;
		const search = or(
			ilike(invoices.invoiceNumber, pattern),
			ilike(orders.orderNumber, pattern),
			ilike(bookProjects.title, pattern),
			ilike(bookProjects.authorName, pattern)
		);
		if (search) invoiceConditions.push(search);
	}
	/* Periode menyaring tanggal terbit invoice, bukan jatuh tempo: laporan
	   bulanan menjawab "tagihan apa yang saya buat bulan ini". */
	if (period.from) invoiceConditions.push(sql`${invoices.createdAt} >= ${period.from}::date`);
	if (period.to) {
		invoiceConditions.push(sql`${invoices.createdAt} < (${period.to}::date + interval '1 day')`);
	}

	const invoiceWhere = and(...invoiceConditions);

	/*
	 * KPI dipisah menjadi dua konsep yang tidak boleh dicampur:
	 *
	 *  - **Arus** (kas diterima, jumlah invoice lunas) mengikuti periode dan
	 *    dihitung dari `invoice_payments.paid_at` — uang yang benar-benar
	 *    masuk bulan itu. Memakai `invoices.created_at` akan menampilkan nol
	 *    untuk bulan berjalan padahal tagihan lama baru dibayar sekarang.
	 *  - **Saldo** (piutang, jatuh tempo, jatuh tempo dekat) adalah keadaan
	 *    saat ini. Menyaringnya dengan periode membuat "piutang berjalan"
	 *    hanya berarti "piutang yang terbit bulan ini", yang bukan pertanyaan
	 *    yang diajukan angka itu.
	 */
	const balanceConditions: SQL[] = [sql`${invoices.status} <> 'VOID'`];
	const balanceWhere = and(...balanceConditions);

	const flowConditions: SQL[] = [];
	if (period.from) flowConditions.push(sql`${invoicePayments.paidAt} >= ${period.from}::date`);
	if (period.to) {
		flowConditions.push(sql`${invoicePayments.paidAt} < (${period.to}::date + interval '1 day')`);
	}
	const flowWhere = flowConditions.length > 0 ? and(...flowConditions) : undefined;

	const invoiceSortColumn =
		INVOICE_SORT[invoiceQuery.sort as keyof typeof INVOICE_SORT] ?? INVOICE_SORT.due;

	const invoiceBase = db
		.select({
			id: invoices.id,
			invoiceNumber: invoices.invoiceNumber,
			kind: invoices.kind,
			status: invoices.status,
			amount: invoices.amount,
			paidAmount: invoices.paidAmount,
			dueDate: invoices.dueDate,
			paidAt: invoices.paidAt,
			createdAt: invoices.createdAt,
			orderNumber: orders.orderNumber,
			projectId: bookProjects.id,
			projectTitle: bookProjects.title,
			authorName: bookProjects.authorName,
			packageName: packages.name
		})
		.from(invoices)
		.innerJoin(orders, eq(orders.id, invoices.orderId))
		.innerJoin(packages, eq(packages.id, orders.packageId))
		.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id));

	/* -------------------------------- Kewajiban -------------------------------- */
	const withdrawalQuery = parseTableQuery(url, {
		sortable: Object.keys(WITHDRAWAL_SORT),
		defaultSort: 'created',
		defaultDir: 'desc',
		filterOptions: { status: [...WITHDRAWAL_STATUSES] }
	});

	const withdrawalConditions: SQL[] = [];
	if (withdrawalQuery.filters.status) {
		withdrawalConditions.push(
			eq(withdrawalRequests.status, withdrawalQuery.filters.status as never)
		);
	}
	if (withdrawalQuery.q) {
		const pattern = `%${withdrawalQuery.q}%`;
		const search = or(
			ilike(profiles.fullName, pattern),
			ilike(withdrawalRequests.bankName, pattern),
			ilike(withdrawalRequests.bankAccountNumber, pattern)
		);
		if (search) withdrawalConditions.push(search);
	}
	if (period.from) {
		withdrawalConditions.push(sql`${withdrawalRequests.createdAt} >= ${period.from}::date`);
	}
	if (period.to) {
		withdrawalConditions.push(
			sql`${withdrawalRequests.createdAt} < (${period.to}::date + interval '1 day')`
		);
	}
	const withdrawalWhere =
		withdrawalConditions.length > 0 ? and(...withdrawalConditions) : undefined;
	const withdrawalSortColumn =
		WITHDRAWAL_SORT[withdrawalQuery.sort as keyof typeof WITHDRAWAL_SORT] ??
		WITHDRAWAL_SORT.created;

	const withdrawalBase = db
		.select({
			id: withdrawalRequests.id,
			wallet: withdrawalRequests.wallet,
			amount: withdrawalRequests.amount,
			status: withdrawalRequests.status,
			bankName: withdrawalRequests.bankName,
			bankAccountName: withdrawalRequests.bankAccountName,
			bankAccountNumber: withdrawalRequests.bankAccountNumber,
			note: withdrawalRequests.note,
			createdAt: withdrawalRequests.createdAt,
			processedAt: withdrawalRequests.processedAt,
			userId: profiles.id,
			userName: profiles.fullName,
			userRole: profiles.role,
			specialty: profiles.specialty
		})
		.from(withdrawalRequests)
		.innerJoin(profiles, eq(profiles.id, withdrawalRequests.userId));

	const [
		invoiceRows,
		invoiceCount,
		withdrawalRows,
		withdrawalCount,
		freelancerRollup,
		royaltyRollup,
		printRows,
		salesRows,
		balanceRows,
		flowRows
	] = await Promise.all([
		invoiceBase
			.where(invoiceWhere)
			.orderBy(
				invoiceQuery.dir === 'asc' ? asc(invoiceSortColumn) : desc(invoiceSortColumn),
				asc(invoices.id)
			)
			.limit(invoiceQuery.size)
			.offset((invoiceQuery.page - 1) * invoiceQuery.size),

		db
			.select({ total: sql<number>`count(*)::int` })
			.from(invoices)
			.innerJoin(orders, eq(orders.id, invoices.orderId))
			.innerJoin(packages, eq(packages.id, orders.packageId))
			.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
			.where(invoiceWhere),

		withdrawalBase
			.where(withdrawalWhere)
			.orderBy(
				withdrawalQuery.dir === 'asc'
					? asc(withdrawalSortColumn)
					: desc(withdrawalSortColumn),
				asc(withdrawalRequests.id)
			)
			.limit(withdrawalQuery.size)
			.offset((withdrawalQuery.page - 1) * withdrawalQuery.size),

		db
			.select({ total: sql<number>`count(*)::int` })
			.from(withdrawalRequests)
			.innerJoin(profiles, eq(profiles.id, withdrawalRequests.userId))
			.where(withdrawalWhere),

		db
			.select({
				freelancerId: freelancerLedgers.freelancerId,
				freelancerName: profiles.fullName,
				specialty: profiles.specialty,
				available: sql<string>`coalesce(sum(case when ${freelancerLedgers.status} = 'AVAILABLE' then ${freelancerLedgers.amount} else 0 end), 0)`,
				pending: sql<string>`coalesce(sum(case when ${freelancerLedgers.status} = 'PENDING' then ${freelancerLedgers.amount} else 0 end), 0)`,
				withdrawn: sql<string>`coalesce(sum(case when ${freelancerLedgers.status} = 'WITHDRAWN' then abs(${freelancerLedgers.amount}) else 0 end), 0)`,
				entryCount: sql<number>`count(*)::int`
			})
			.from(freelancerLedgers)
			.innerJoin(profiles, eq(profiles.id, freelancerLedgers.freelancerId))
			.groupBy(freelancerLedgers.freelancerId, profiles.fullName, profiles.specialty),

		db
			.select({
				authorId: royaltyLedgers.authorId,
				available: sql<string>`coalesce(sum(case when ${royaltyLedgers.status} = 'AVAILABLE' then ${royaltyLedgers.amount} else 0 end), 0)`,
				pending: sql<string>`coalesce(sum(case when ${royaltyLedgers.status} = 'PENDING' then ${royaltyLedgers.amount} else 0 end), 0)`,
				withdrawn: sql<string>`coalesce(sum(case when ${royaltyLedgers.status} = 'WITHDRAWN' then abs(${royaltyLedgers.amount}) else 0 end), 0)`
			})
			.from(royaltyLedgers)
			.groupBy(royaltyLedgers.authorId),

		db
			.select({
				projectId: printRuns.projectId,
				title: bookProjects.title,
				quantity: printRuns.quantity,
				totalCost: printRuns.totalCost,
				costPerUnit: printRuns.costPerUnit,
				createdAt: printRuns.createdAt
			})
			.from(printRuns)
			.innerJoin(bookProjects, eq(bookProjects.id, printRuns.projectId))
			.orderBy(desc(printRuns.createdAt)),

		db
			.select({
				projectId: bookProjects.id,
				title: bookProjects.title,
				netRoyalty: sql<string>`coalesce(sum(${royaltyLedgers.amount}), 0)`
			})
			.from(royaltyLedgers)
			.innerJoin(bookProjects, eq(bookProjects.id, royaltyLedgers.projectId))
			.where(eq(royaltyLedgers.entryType, 'ROYALTY'))
			.groupBy(bookProjects.id, bookProjects.title),

		/* Saldo saat ini: tidak boleh ikut periode (lihat catatan di atas). */
		db
			.select({
				receivable: sql<string>`coalesce(sum(greatest(${invoices.amount} - ${invoices.paidAmount}, 0)) filter (where ${invoices.status} <> 'PAID'), 0)`,
				openCount: sql<number>`count(*) filter (where ${invoices.status} <> 'PAID')::int`,
				overdueCount: sql<number>`count(*) filter (where ${invoices.status} = 'OVERDUE' or (${invoices.status} <> 'PAID' and ${invoices.dueDate} < current_date))::int`,
				overdueAmount: sql<string>`coalesce(sum(greatest(${invoices.amount} - ${invoices.paidAmount}, 0)) filter (where ${invoices.status} = 'OVERDUE' or (${invoices.status} <> 'PAID' and ${invoices.dueDate} < current_date)), 0)`,
				dueSoonCount: sql<number>`count(*) filter (where ${invoices.status} <> 'PAID' and ${invoices.dueDate} between current_date and current_date + 7)::int`
			})
			.from(invoices)
			.where(balanceWhere),

		/* Arus kas periode: dari tanggal pembayaran, bukan tanggal invoice. */
		db
			.select({
				revenue: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)`,
				paidCount: sql<number>`count(distinct ${invoicePayments.invoiceId})::int`
			})
			.from(invoicePayments)
			.where(flowWhere)
	]);

	const kpiRow = {
		revenue: '0',
		receivable: '0',
		paidCount: 0,
		openCount: 0,
		overdueCount: 0,
		overdueAmount: '0',
		dueSoonCount: 0,
		...balanceRows[0],
		...flowRows[0]
	} satisfies Record<string, unknown> as {
		revenue: string;
		receivable: string;
		paidCount: number;
		openCount: number;
		overdueCount: number;
		overdueAmount: string;
		dueSoonCount: number;
	};

	/* ------------------------------ Kewajiban ------------------------------- */
	const freelancerPayable = freelancerRollup.reduce((acc, r) => acc + toNumber(r.available), 0);
	const royaltyPayable = royaltyRollup.reduce((acc, r) => acc + toNumber(r.available), 0);

	const pendingWithdrawals = withdrawalRows.filter(
		(w) => w.status === 'REQUESTED' || w.status === 'APPROVED'
	);

	const printCost = printRows.reduce((acc, r) => acc + toNumber(r.totalCost), 0);
	const printUnits = printRows.reduce((acc, r) => acc + r.quantity, 0);

	const settledWithdrawals = await db
		.select({
			total: sql<string>`coalesce(sum(${withdrawalRequests.amount}), 0)`
		})
		.from(withdrawalRequests)
		.where(eq(withdrawalRequests.status, 'PAID'));

	const printRevenue = [
		toNumber(kpiRow.revenue),
		toNumber(settledWithdrawals[0]?.total ?? 0)
	] as const;

	return {
		tab,
		period,
		quickPeriods: quickPeriods(),
		analytics: await loadAnalytics(12),
		kpi: {
			revenue: toNumber(kpiRow.revenue),
			receivable: toNumber(kpiRow.receivable),
			overdueAmount: toNumber(kpiRow.overdueAmount),
			overdueCount: Number(kpiRow.overdueCount ?? 0),
			dueSoonCount: Number(kpiRow.dueSoonCount ?? 0),
			paidCount: Number(kpiRow.paidCount ?? 0),
			openCount: Number(kpiRow.openCount ?? 0),
			freelancerPayable,
			royaltyPayable,
			liabilities: freelancerPayable + royaltyPayable,
			printCost,
			printUnits,
			settledWithdrawals: printRevenue[1],
			/** Kas bersih = uang masuk − HPP cetak − penarikan yang sudah dibayar. */
			netCash: printRevenue[0] - printCost - printRevenue[1]
		},
		invoices: invoiceRows.map((row) => ({
			...row,
			amountNum: toNumber(row.amount),
			paidAmountNum: toNumber(row.paidAmount),
			outstanding:
				row.status === 'PAID'
					? 0
					: Math.max(0, toNumber(row.amount) - toNumber(row.paidAmount)),
			days: daysUntil(row.dueDate)
		})),
		recentPaid: await db
			.select({
				id: invoices.id,
				invoiceNumber: invoices.invoiceNumber,
				kind: invoices.kind,
				status: invoices.status,
				amount: invoices.amount,
				paidAmount: invoices.paidAmount,
				dueDate: invoices.dueDate,
				paidAt: invoices.paidAt,
				createdAt: invoices.createdAt,
				orderNumber: orders.orderNumber,
				projectId: bookProjects.id,
				projectTitle: bookProjects.title,
				authorName: bookProjects.authorName,
				packageName: packages.name
			})
			.from(invoices)
			.innerJoin(orders, eq(orders.id, invoices.orderId))
			.innerJoin(packages, eq(packages.id, orders.packageId))
			.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
			.where(eq(invoices.status, 'PAID'))
			.orderBy(desc(invoices.paidAt))
			.limit(5)
			.then((rows) =>
				rows.map((row) => ({
					...row,
					amountNum: toNumber(row.amount),
					paidAmountNum: toNumber(row.paidAmount),
					days: daysUntil(row.dueDate)
				}))
			),
		invoiceQuery: finalizeTableQuery(invoiceQuery, invoiceCount[0]?.total ?? 0),
		withdrawals: withdrawalRows.map((w) => ({ ...w, amountNum: toNumber(w.amount) })),
		withdrawalQuery: finalizeTableQuery(withdrawalQuery, withdrawalCount[0]?.total ?? 0),
		pendingWithdrawalCount: pendingWithdrawals.length,
		freelancers: freelancerRollup
			.map((r) => ({
				...r,
				availableNum: toNumber(r.available),
				pendingNum: toNumber(r.pending),
				withdrawnNum: toNumber(r.withdrawn)
			}))
			.sort((a, b) => b.availableNum - a.availableNum),
		printRuns: printRows.slice(0, 6).map((r, index) => ({
			...r,
			id: `${r.projectId}-${r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt}-${index}`,
			totalCostNum: toNumber(r.totalCost),
			costPerUnitNum: toNumber(r.costPerUnit)
		})),
		topRoyalty: salesRows
			.map((r) => ({ projectId: r.projectId, title: r.title, royalty: toNumber(r.netRoyalty) }))
			.sort((a, b) => b.royalty - a.royalty)
			.slice(0, 5)
	};
};

export const actions: Actions = {
	/** Verifikasi transfer masuk pada satu invoice. */
	'pay-invoice': async ({ request, locals }) => {
		const role = locals.profile?.role;
		if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat memverifikasi pembayaran.' });
		}
		const form = await request.formData();
		const invoiceId = String(form.get('invoiceId') ?? '');
		if (!invoiceId) return fail(400, { message: 'Invoice tidak dipilih.' });

		try {
			const { value: result, replayed } = await runIdempotent({
				scope: 'invoice.pay',
				actorId: locals.profile!.id,
				requestId: readRequestId(form),
				work: () => handleInvoicePaid(invoiceId),
				serialize: (value) => ({ ...value })
			});

			/* Hanya catat sekali: request yang diputar ulang bukan aksi baru. */
			if (!replayed && !result.alreadyPaid) {
				await audit({
					actor: locals.profile,
					action: 'invoice.paid',
					entityType: 'invoice',
					entityId: invoiceId,
					summary: `Memverifikasi pembayaran ${result.invoiceNumber}. Tahap terbuka: ${result.unlocked.join(', ') || '—'}.`,
					context: { invoiceNumber: result.invoiceNumber, unlocked: result.unlocked },
					requestId: readRequestId(form)
				});
			}

			return {
				ok: true,
				replayed,
				message: result.alreadyPaid
					? `Invoice ${result.invoiceNumber} sudah lunas sebelumnya.`
					: `Pembayaran ${result.invoiceNumber} terverifikasi. Tahap terbuka: ${result.unlocked.join(', ') || '—'}`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/**
	 * Verifikasi banyak invoice sekaligus.
	 *
	 * Kerja borongan adalah norma di keuangan: mencentang sepuluh transfer lalu
	 * memverifikasi semuanya lebih masuk akal daripada sepuluh dialog.
	 *
	 * Setiap invoice tetap diverifikasi lewat `handleInvoicePaid` di dalam
	 * transaksinya sendiri, jadi satu invoice bermasalah (mis. sudah dibatalkan)
	 * tidak membatalkan yang lain. Kunci idempoten per invoice membuat percobaan
	 * ulang aman.
	 */
	'pay-invoices-bulk': async ({ request, locals }) => {
		const role = locals.profile?.role;
		if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat memverifikasi pembayaran.' });
		}

		const form = await request.formData();
		const ids = form
			.getAll('invoiceId')
			.map((value) => String(value))
			.filter(Boolean);
		if (ids.length === 0) {
			return fail(400, { message: 'Pilih setidaknya satu invoice.' });
		}

		const succeeded: string[] = [];
		const failed: { invoiceNumber: string; reason: string }[] = [];

		/* Ambil nomor invoice dulu agar pesan galat menyebut nomor, bukan UUID. */
		const known = await db
			.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
			.from(invoices)
			.where(inArray(invoices.id, ids));
		const numberById = new Map(known.map((row) => [row.id, row.invoiceNumber]));

		for (const [index, invoiceId] of ids.entries()) {
			try {
				const { value: paid, replayed } = await runIdempotent({
					scope: 'invoice.pay',
					actorId: locals.profile!.id,
					requestId: readRequestId(form) ? `${readRequestId(form)}-${index}` : null,
					work: () => handleInvoicePaid(invoiceId),
					serialize: (value) => ({ ...value })
				});
				succeeded.push(numberById.get(invoiceId) ?? invoiceId.slice(0, 8));

				if (!replayed && !paid.alreadyPaid) {
					await audit({
						actor: locals.profile,
						action: 'invoice.paid',
						entityType: 'invoice',
						entityId: invoiceId,
						summary: `Memverifikasi ${paid.invoiceNumber} lewat aksi massal. Tahap terbuka: ${paid.unlocked.join(', ') || '—'}.`,
						context: { invoiceNumber: paid.invoiceNumber, bulk: true },
						requestId: `${readRequestId(form)}-${index}`
					});
				}
			} catch (e) {
				failed.push({
					invoiceNumber: numberById.get(invoiceId) ?? invoiceId.slice(0, 8),
					reason: e instanceof ErpError ? e.message : 'Kesalahan tak terduga.'
				});
			}
		}

		if (succeeded.length === 0) {
			return fail(422, {
				message: `Tidak ada invoice yang terverifikasi. ${failed
					.map((f) => `${f.invoiceNumber}: ${f.reason}`)
					.join(' ')}`
			});
		}

		const head =
			failed.length === 0
				? `${succeeded.length} invoice terverifikasi: ${succeeded.join(', ')}.`
				: `${succeeded.length} invoice terverifikasi (${succeeded.join(', ')}). ${failed.length} gagal: ${failed
						.map((f) => `${f.invoiceNumber} — ${f.reason}`)
						.join('; ')}.`;

		return { ok: true, message: head };
	},

	/** Tandai beberapa invoice sebagai jatuh tempo (penanda tindak lanjut). */
	'mark-overdue-bulk': async ({ request, locals }) => {
		const role = locals.profile?.role;
		if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat mengubah status invoice.' });
		}

		const form = await request.formData();
		const ids = form
			.getAll('invoiceId')
			.map((value) => String(value))
			.filter(Boolean);
		if (ids.length === 0) {
			return fail(400, { message: 'Pilih setidaknya satu invoice.' });
		}

		const updated = await db
			.update(invoices)
			.set({ status: 'OVERDUE' })
			.where(and(inArray(invoices.id, ids), eq(invoices.status, 'UNPAID')))
			.returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

		if (updated.length === 0) {
			return fail(422, {
				message: 'Tidak ada invoice berstatus Belum Bayar pada pilihan ini.'
			});
		}

		/* Satu baris audit per invoice: jejak harus bisa ditelusuri per dokumen. */
		for (const row of updated) {
			await audit({
				actor: locals.profile,
				action: 'invoice.marked_overdue',
				entityType: 'invoice',
				entityId: row.id,
				summary: `Menandai ${row.invoiceNumber} sebagai jatuh tempo.`,
				changes: { status: { from: 'UNPAID', to: 'OVERDUE' } },
				context: { invoiceNumber: row.invoiceNumber }
			});
		}

		return {
			ok: true,
			message: `${updated.length} invoice ditandai jatuh tempo: ${updated
				.map((row) => row.invoiceNumber)
				.join(', ')}.`
		};
	},

	/** Setujui, bayar, atau tolak penarikan saldo. */
	'process-withdrawal': async ({ request, locals }) => {
		const role = locals.profile?.role;
		if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat memproses penarikan.' });
		}
		const form = await request.formData();
		const withdrawalId = String(form.get('withdrawalId') ?? '');
		const action = String(form.get('action') ?? '') as 'APPROVE' | 'PAY' | 'REJECT';
		const note = String(form.get('note') ?? '') || undefined;

		if (!withdrawalId) return fail(400, { message: 'Penarikan tidak dipilih.' });
		if (!['APPROVE', 'PAY', 'REJECT'].includes(action)) {
			return fail(400, { message: 'Aksi penarikan tidak dikenal.' });
		}

		try {
			const { replayed } = await runIdempotent({
				scope: `withdrawal.${action.toLowerCase()}`,
				actorId: locals.profile!.id,
				requestId: readRequestId(form),
				work: () =>
					processWithdrawal({
						withdrawalId,
						action,
						processedBy: locals.profile!.id,
						note
					}),
				serialize: (value) => ({ ...value })
			});

			const label =
				action === 'APPROVE' ? 'disetujui' : action === 'PAY' ? 'ditandai sudah dibayar' : 'ditolak';

			if (!replayed) {
				await audit({
					actor: locals.profile,
					action: `withdrawal.${action.toLowerCase()}`,
					entityType: 'withdrawal',
					entityId: withdrawalId,
					summary: `Penarikan ${label}${note ? ` dengan catatan: ${note}` : ''}.`,
					changes: {
						status: {
							from: action === 'APPROVE' ? 'REQUESTED' : action === 'PAY' ? 'APPROVED' : null,
							to: action === 'APPROVE' ? 'APPROVED' : action === 'PAY' ? 'PAID' : 'REJECTED'
						}
					},
					context: { withdrawalId, note: note ?? null },
					requestId: readRequestId(form)
				});
			}

			return { ok: true, replayed, message: `Penarikan ${label}. Saldo ledger diperbarui.` };
		} catch (e) {
			return toFailure(e);
		}
	}
};
