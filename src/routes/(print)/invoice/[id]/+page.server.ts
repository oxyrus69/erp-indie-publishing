import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$db';
import { bookProjects, invoicePayments, invoices, orders, packages, profiles } from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import type { PageServerLoad } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Invoice siap cetak.
 *
 * Penulis membutuhkan dokumen resmi untuk pengajuan pembayaran, jadi halaman
 * ini memuat identitas penerbit, data penulis, rincian tagihan, dan riwayat
 * pembayaran. Bisa diakses staf internal maupun penulis pemilik order —
 * keduanya melihat dokumen yang sama, tanpa data internal lain.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const profile = locals.profile;
	if (!profile) error(401, 'Silakan masuk terlebih dahulu.');
	if (!UUID_RE.test(params.id)) error(404, 'Invoice tidak ditemukan.');

	const isFinance = profile.role === 'SUPER_ADMIN' || profile.role === 'FINANCE';
	const isStaff =
		isFinance || profile.role === 'PROJECT_MANAGER';

	const [row] = await db
		.select({
			id: invoices.id,
			invoiceNumber: invoices.invoiceNumber,
			kind: invoices.kind,
			status: invoices.status,
			amount: invoices.amount,
			paidAmount: invoices.paidAmount,
			description: invoices.description,
			dueDate: invoices.dueDate,
			paidAt: invoices.paidAt,
			createdAt: invoices.createdAt,
			milestonePct: invoices.milestonePct,
			orderNumber: orders.orderNumber,
			orderId: orders.id,
			authorId: orders.authorId,
			authorName: profiles.fullName,
			authorEmail: profiles.email,
			bookTitle: orders.bookTitle,
			packageName: packages.name,
			projectId: bookProjects.id,
			projectTitle: bookProjects.title
		})
		.from(invoices)
		.innerJoin(orders, eq(orders.id, invoices.orderId))
		.innerJoin(packages, eq(packages.id, orders.packageId))
		.leftJoin(profiles, eq(profiles.id, orders.authorId))
		.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
		.where(eq(invoices.id, params.id))
		.limit(1);

	if (!row) error(404, 'Invoice tidak ditemukan.');

	/* Penulis hanya boleh membuka invoice miliknya sendiri. */
	if (!isStaff && row.authorId !== profile.id) {
		error(403, 'Invoice ini bukan milik akun Anda.');
	}

	const payments = await db
		.select({
			id: invoicePayments.id,
			amount: invoicePayments.amount,
			method: invoicePayments.method,
			reference: invoicePayments.reference,
			paidAt: invoicePayments.paidAt
		})
		.from(invoicePayments)
		.where(eq(invoicePayments.invoiceId, row.id))
		.orderBy(invoicePayments.paidAt);

	const auto = url.searchParams.get('print') === '1';

	return {
		invoice: {
			...row,
			amountNum: toNumber(row.amount),
			paidAmountNum: toNumber(row.paidAmount),
			outstanding: Math.max(0, toNumber(row.amount) - toNumber(row.paidAmount)),
			milestoneNum: row.milestonePct ? toNumber(row.milestonePct) : null
		},
		payments: payments.map((row) => ({ ...row, amountNum: toNumber(row.amount) })),
		autoPrint: auto,
		backHref: row.projectId ? `/projects/${row.projectId}` : isStaff ? '/admin/finance' : '/portal'
	};
};
