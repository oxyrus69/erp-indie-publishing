import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import { bookProjects, invoices, orders, packages, profiles, withdrawalRequests } from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import { parseTableQuery } from '$lib/table/query';
import { parsePeriod } from '$lib/table/period';
import { INVOICE_KIND, INVOICE_STATUS } from '$lib/ui';
import type { PageServerLoad } from './$types';

const FINANCE_ROLES = ['SUPER_ADMIN', 'FINANCE'] as const;

/**
 * Rekap siap cetak.
 *
 * Memakai filter yang sama dengan antrean di layar, tetapi tanpa pemotongan
 * halaman: dokumen rekap harus utuh supaya bisa ditandatangani dan diarsipkan.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
		error(403, 'Hanya tim keuangan yang dapat mencetak rekap.');
	}

	const tab = url.searchParams.get('tab') === 'payables' ? 'payables' : 'receivables';
	const period = parsePeriod(url);

	if (tab === 'payables') {
		const rows = await db
			.select({
				userName: profiles.fullName,
				userRole: profiles.role,
				specialty: profiles.specialty,
				wallet: withdrawalRequests.wallet,
				amount: withdrawalRequests.amount,
				status: withdrawalRequests.status,
				bankName: withdrawalRequests.bankName,
				bankAccountName: withdrawalRequests.bankAccountName,
				bankAccountNumber: withdrawalRequests.bankAccountNumber,
				createdAt: withdrawalRequests.createdAt
			})
			.from(withdrawalRequests)
			.innerJoin(profiles, eq(profiles.id, withdrawalRequests.userId))
			.where(
				and(
					...(period.from
						? [sql`${withdrawalRequests.createdAt} >= ${period.from}::date`]
						: []),
					...(period.to
						? [sql`${withdrawalRequests.createdAt} < (${period.to}::date + interval '1 day')`]
						: [])
				)
			)
			.orderBy(desc(withdrawalRequests.createdAt));

		const total = rows
			.filter((row) => row.status === 'REQUESTED' || row.status === 'APPROVED')
			.reduce((acc, row) => acc + toNumber(row.amount), 0);

		return {
			tab,
			period,
			withdrawals: rows.map((row) => ({
				...row,
				amountNum: toNumber(row.amount)
			})),
			totals: { total },
			filter: period.isAllTime ? 'Semua penarikan' : `Penarikan · ${period.label}`
		};
	}

	const query = parseTableQuery(url, {
		sortable: ['due', 'number', 'amount'],
		defaultSort: 'due',
		defaultDir: 'asc',
		filterOptions: {
			status: Object.keys(INVOICE_STATUS),
			bucket: ['overdue', 'dueSoon', 'notDue']
		}
	});

	const conditions: SQL[] = [sql`${invoices.status} <> 'VOID'`];
	if (query.filters.status) {
		conditions.push(eq(invoices.status, query.filters.status as never));
	} else {
		conditions.push(sql`${invoices.status} <> 'PAID'`);
	}
	if (query.filters.bucket === 'overdue') {
		conditions.push(
			sql`(${invoices.status} = 'OVERDUE' or (${invoices.dueDate} is not null and ${invoices.dueDate} < current_date))`
		);
	}
	if (query.q) {
		const pattern = `%${query.q}%`;
		const search = or(
			ilike(invoices.invoiceNumber, pattern),
			ilike(bookProjects.title, pattern),
			ilike(bookProjects.authorName, pattern)
		);
		if (search) conditions.push(search);
	}
	if (period.from) conditions.push(sql`${invoices.createdAt} >= ${period.from}::date`);
	if (period.to) {
		conditions.push(sql`${invoices.createdAt} < (${period.to}::date + interval '1 day')`);
	}

	const rows = await db
		.select({
			invoiceNumber: invoices.invoiceNumber,
			kind: invoices.kind,
			status: invoices.status,
			orderNumber: orders.orderNumber,
			projectTitle: bookProjects.title,
			authorName: bookProjects.authorName,
			amount: invoices.amount,
			paidAmount: invoices.paidAmount,
			dueDate: invoices.dueDate
		})
		.from(invoices)
		.innerJoin(orders, eq(orders.id, invoices.orderId))
		.innerJoin(packages, eq(packages.id, orders.packageId))
		.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
		.where(and(...conditions))
		.orderBy(query.dir === 'asc' ? asc(invoices.dueDate) : desc(invoices.dueDate));

	const mapped = rows.map((row) => ({
		...row,
		amountNum: toNumber(row.amount),
		outstanding: Math.max(0, toNumber(row.amount) - toNumber(row.paidAmount))
	}));

	const filterLabel = query.filters.status
		? `Status: ${INVOICE_STATUS[query.filters.status]?.label ?? query.filters.status}`
		: 'Semua invoice belum lunas';

	return {
		tab,
		period,
		invoices: mapped,
		totals: {
			total: mapped.reduce((acc, row) => acc + row.amountNum, 0),
			outstanding: mapped.reduce((acc, row) => acc + row.outstanding, 0),
			count: mapped.length
		},
		filter: filterLabel,
		kinds: INVOICE_KIND
	};
};
