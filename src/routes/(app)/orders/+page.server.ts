import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import { orders, packages, profiles, services } from '$db/schema';
import { toNumber, toMoneyString } from '$lib/server/services/money';
import { cancelOrder, createOrder } from '$lib/server/services/orders';
import { ErpError } from '$lib/server/services/erpErrors';
import { audit } from '$lib/server/services/auditDraft';
import { readRequestId, runIdempotent } from '$lib/server/services/idempotency';
import { finalizeTableQuery, parseTableQuery } from '$lib/table/query';
import { ORDER_STATUS } from '$lib/ui';
import type { Actions, PageServerLoad } from './$types';

const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;
const PM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

const ORDER_SORT = {
	created: orders.createdAt,
	number: orders.orderNumber,
	title: orders.bookTitle,
	amount: orders.totalAmount,
	status: orders.status
} as const;

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Daftar order + data untuk form pembuatan.
 *
 * Order adalah dokumen pertama dalam rantai: order → invoice → proyek → task.
 * Halaman ini adalah satu-satunya pintu masuknya, sehingga katalog (paket,
 * layanan) dan direktori penulis dimuat bersama daftar — bukan di halaman
 * terpisah yang membuat alur "buat order" jadi tiga klik navigasi.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
		error(403, 'Daftar order hanya untuk tim internal penerbitan.');
	}

	const query = parseTableQuery(url, {
		sortable: Object.keys(ORDER_SORT),
		defaultSort: 'created',
		defaultDir: 'desc',
		filterOptions: { status: Object.keys(ORDER_STATUS) }
	});

	const conditions: SQL[] = [];
	if (query.filters.status) {
		conditions.push(eq(orders.status, query.filters.status as never));
	}
	if (query.q) {
		const pattern = `%${query.q}%`;
		const search = or(
			ilike(orders.orderNumber, pattern),
			ilike(orders.bookTitle, pattern),
			ilike(profiles.fullName, pattern)
		);
		if (search) conditions.push(search);
	}
	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const sortColumn = ORDER_SORT[query.sort as keyof typeof ORDER_SORT] ?? ORDER_SORT.created;

	const [rows, countRows, packageRows, serviceRows, authorRows, countRows2] = await Promise.all([
		db
			.select({
				id: orders.id,
				orderNumber: orders.orderNumber,
				bookTitle: orders.bookTitle,
				bookSubtitle: orders.bookSubtitle,
				status: orders.status,
				totalAmount: orders.totalAmount,
				paidAmount: orders.paidAmount,
				isFullyPaid: orders.isFullyPaid,
				createdAt: orders.createdAt,
				authorName: profiles.fullName,
				authorEmail: profiles.email,
				packageName: packages.name,
				packageCode: packages.code
			})
			.from(orders)
			.innerJoin(profiles, eq(profiles.id, orders.authorId))
			.innerJoin(packages, eq(packages.id, orders.packageId))
			.where(where)
			.orderBy(query.dir === 'asc' ? asc(sortColumn) : desc(sortColumn), asc(orders.id))
			.limit(query.size)
			.offset((query.page - 1) * query.size),

		db
			.select({ total: sql<number>`count(*)::int` })
			.from(orders)
			.innerJoin(profiles, eq(profiles.id, orders.authorId))
			.where(where),

		db
			.select({
				id: packages.id,
				code: packages.code,
				name: packages.name,
				tagline: packages.tagline,
				basePrice: packages.basePrice,
				downPaymentPct: packages.downPaymentPct,
				freeAuthorCopies: packages.freeAuthorCopies,
				authorRoyaltyPct: packages.authorRoyaltyPct
			})
			.from(packages)
			.where(eq(packages.isActive, true))
			.orderBy(asc(packages.sortOrder), asc(packages.name)),

		db
			.select({
				id: services.id,
				name: services.name,
				unitPrice: services.unitPrice,
				unit: services.unit
			})
			.from(services)
			.where(eq(services.isActive, true))
			.orderBy(asc(services.name)),

		db
			.select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email })
			.from(profiles)
			.where(and(eq(profiles.role, 'AUTHOR'), eq(profiles.isActive, true)))
			.orderBy(asc(profiles.fullName)),

		db
			.select({
				total: sql<number>`count(*)::int`,
				awaitingDp: sql<number>`count(*) filter (where ${orders.status} = 'AWAITING_DOWN_PAYMENT')::int`,
				inProduction: sql<number>`count(*) filter (where ${orders.status} = 'IN_PRODUCTION')::int`,
				value: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`
			})
			.from(orders)
	]);

	const counts = countRows2[0];

	return {
		orders: rows.map((row) => ({
			...row,
			totalNum: toNumber(row.totalAmount),
			paidNum: toNumber(row.paidAmount),
			paidPct:
				toNumber(row.totalAmount) > 0
					? Math.round((toNumber(row.paidAmount) / toNumber(row.totalAmount)) * 100)
					: 0
		})),
		query: finalizeTableQuery(query, countRows[0]?.total ?? 0),
		packages: packageRows.map((row) => ({
			...row,
			basePriceNum: toNumber(row.basePrice),
			downPaymentPctNum: toNumber(row.downPaymentPct),
			authorRoyaltyPctNum: toNumber(row.authorRoyaltyPct)
		})),
		services: serviceRows.map((row) => ({ ...row, unitPriceNum: toNumber(row.unitPrice) })),
		authors: authorRows,
		/**
		 * Prefill dari CRM: setelah prospek menang, tautan membawa penulis yang
		 * baru dibuat (dan judul/paket bila dipilih saat konversi). Hanya
		 * diteruskan bila penulisnya memang ada di daftar, supaya URL asal-asalan
		 * tidak menyisipkan id yang tidak bisa dipakai.
		 */
		prefill: (() => {
			const authorId = url.searchParams.get('authorId') ?? '';
			const bookTitle = url.searchParams.get('bookTitle') ?? '';
			const packageId = url.searchParams.get('packageId') ?? '';
			return {
				authorId: authorRows.some((row) => row.id === authorId) ? authorId : '',
				bookTitle,
				packageId: packageRows.some((row) => row.id === packageId) ? packageId : ''
			};
		})(),
		kpi: {
			totalOrders: Number(counts?.total ?? 0),
			awaitingDp: Number(counts?.awaitingDp ?? 0),
			inProduction: Number(counts?.inProduction ?? 0),
			totalValue: toNumber(counts?.value ?? 0)
		}
	};
};

export const actions: Actions = {
	/**
	 * Membuat order baru.
	 *
	 * Order mengikat nilai kontrak dan menghasilkan dua invoice sekaligus, jadi
	 * aksinya dibatasi PM/Super Admin dan dilindungi kunci idempoten: dua tap
	 * cepat tidak boleh menghasilkan dua order.
	 */
	create: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat membuat order.' });
		}

		const form = await request.formData();
		const authorId = String(form.get('authorId') ?? '').trim();
		const packageId = String(form.get('packageId') ?? '').trim();
		const bookTitle = String(form.get('bookTitle') ?? '').trim();
		const bookSubtitle = String(form.get('bookSubtitle') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();
		const dueInDays = Number(form.get('dueInDays') ?? 14);

		if (!authorId) return fail(400, { message: 'Pilih penulis terlebih dahulu.' });
		if (!packageId) return fail(400, { message: 'Pilih paket terlebih dahulu.' });
		if (bookTitle.length < 2) return fail(400, { message: 'Judul buku minimal 2 karakter.' });

		/* Layanan tambahan dikirim sebagai pasangan serviceId + quantity. */
		const serviceIds = form.getAll('serviceId').map((value) => String(value)).filter(Boolean);
		const quantities = form.getAll('serviceQty').map((value) => Number(value) || 1);
		const extras = serviceIds.map((serviceId, index) => ({
			serviceId,
			quantity: quantities[index] ?? 1
		}));

		try {
			const { value: result, replayed } = await runIdempotent({
				scope: 'order.create',
				actorId: profile.id,
				requestId: readRequestId(form),
				work: () =>
					createOrder({
						authorId,
						packageId,
						bookTitle,
						bookSubtitle,
						notes,
						extras,
						createdBy: profile.id,
						dueInDays
					}),
				serialize: (value) => ({ ...value })
			});

			if (!replayed) {
				const [author] = await db
					.select({ fullName: profiles.fullName })
					.from(profiles)
					.where(eq(profiles.id, authorId))
					.limit(1);

				await audit({
					actor: profile,
					action: 'order.created',
					entityType: 'order',
					entityId: result.orderId,
					summary: `Membuat order ${result.orderNumber} untuk ${author?.fullName ?? 'penulis'}: ${bookTitle} senilai ${toMoneyString(Number(result.totalAmount))}. DP ${toMoneyString(Number(result.downPaymentAmount))}.`,
					context: {
						orderNumber: result.orderNumber,
						invoiceNumbers: result.invoiceNumbers,
						packageId
					},
					requestId: readRequestId(form)
				});
			}

			return {
				ok: true,
				replayed,
				message: replayed
					? `Order ${result.orderNumber} sudah dibuat sebelumnya.`
					: `Order ${result.orderNumber} dibuat. DP ${result.downPaymentAmount} menunggu verifikasi.`,
				orderId: result.orderId,
				orderNumber: result.orderNumber
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Membatalkan order yang belum punya pembayaran. */
	cancel: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat membatalkan order.' });
		}

		const form = await request.formData();
		const orderId = String(form.get('orderId') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (!orderId) return fail(400, { message: 'Order tidak dipilih.' });
		if (reason.length < 5) {
			return fail(400, { message: 'Alasan pembatalan minimal 5 karakter agar tercatat jelas.' });
		}

		try {
			const result = await cancelOrder(orderId, reason);

			await audit({
				actor: profile,
				action: 'order.cancelled',
				entityType: 'order',
				entityId: orderId,
				summary: `Membatalkan order ${result.orderNumber}: ${reason}`,
				context: { orderNumber: result.orderNumber, reason }
			});

			return {
				ok: true,
				message: `Order ${result.orderNumber} dibatalkan. Invoice yang belum dibayar ikut dibatalkan.`
			};
		} catch (e) {
			return toFailure(e);
		}
	}
};
