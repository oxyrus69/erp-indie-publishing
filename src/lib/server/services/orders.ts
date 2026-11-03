import { and, eq, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	documentSequences,
	invoices,
	orderItems,
	orders,
	packages,
	profiles,
	services
} from '$db/schema';
import { fail } from './erpErrors';
import { rupiah, toMoneyString, toNumber } from './money';
import { getDocumentSettings } from './settings';

/**
 * Pembuatan order — pintu masuk data ke ERP.
 *
 * Sebelum ini, satu-satunya jalan membuat order adalah seed script. Alur di
 * sini meniru proses nyata di meja penerbitan:
 *
 *  1. Pilih penulis, paket, dan (opsional) layanan tambahan.
 *  2. Nilai kontrak = harga paket + layanan, dengan paket sebagai item pertama.
 *  3. DP dan pelunasan dibuat sekaligus sebagai dua invoice, karena keduanya
 *     sudah diketahui nominalnya saat kontrak ditandatangani. Tanpa ini,
 *     invoice pelunasan harus dibuat manual dengan angka yang diketik ulang —
 *     sumber kesalahan yang mahal.
 *
 * Order lahir berstatus `AWAITING_DOWN_PAYMENT`: produksi baru boleh mulai
 * setelah DP diverifikasi, dan itu tetap menjadi wewenang `handleInvoicePaid`.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OrderLineInput = { serviceId: string; quantity: number };

export type CreateOrderInput = {
	authorId: string;
	packageId: string;
	bookTitle: string;
	bookSubtitle?: string | null;
	notes?: string | null;
	/** Layanan a-la-carte; harga diambil dari katalog saat ini, bukan dari klien. */
	extras?: OrderLineInput[];
	createdBy: string;
	/** Jatuh tempo DP dalam hari. */
	dueInDays?: number;
};

export type CreateOrderResult = {
	orderId: string;
	orderNumber: string;
	totalAmount: string;
	downPaymentAmount: string;
	finalAmount: string;
	invoiceNumbers: string[];
};

/**
 * Nomor dokumen atomik. Prefix dibaca dari pengaturan supaya penomoran bisa
 * mengikuti kebijakan penerbit tanpa deploy ulang.
 */
async function nextNumber(tx: Tx, defaultPrefix: 'ORD' | 'INV'): Promise<string> {
	const doc = await getDocumentSettings();
	const prefix = defaultPrefix === 'ORD' ? doc.orderPrefix : doc.invoicePrefix;

	const now = new Date();
	const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
	const key = `${prefix}:${period}`;

	const [row] = await tx
		.insert(documentSequences)
		.values({ key, lastValue: 1 })
		.onConflictDoUpdate({
			target: documentSequences.key,
			set: { lastValue: sql`${documentSequences.lastValue} + 1` }
		})
		.returning({ lastValue: documentSequences.lastValue });

	const seq = row?.lastValue ?? 1;
	return `${prefix}-${period}-${String(seq).padStart(4, '0')}`;
}

/**
 * Membuat order beserta item dan dua invoice (DP + pelunasan).
 *
 * Semua dalam satu transaksi: order tanpa invoice akan menggantung, dan
 * invoice tanpa order tidak bisa dibayar. Tidak ada keadaan setengah jadi.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
	const title = input.bookTitle.trim();
	if (title.length < 2) {
		fail('INVALID_STATE', 'Judul buku wajib diisi minimal 2 karakter.');
	}
	if (title.length > 240) {
		fail('INVALID_STATE', 'Judul buku maksimal 240 karakter.');
	}

	return db.transaction(async (tx) => {
		const [author] = await tx
			.select({ id: profiles.id, role: profiles.role })
			.from(profiles)
			.where(eq(profiles.id, input.authorId))
			.limit(1);
		if (!author) fail('NOT_FOUND', 'Penulis tidak ditemukan.');
		if (author.role !== 'AUTHOR') {
			fail('INVALID_STATE', 'Order hanya bisa dibuat untuk akun berperan penulis.');
		}

		const [pkg] = await tx
			.select()
			.from(packages)
			.where(eq(packages.id, input.packageId))
			.limit(1);
		if (!pkg) fail('NOT_FOUND', 'Paket tidak ditemukan.');
		if (!pkg.isActive) fail('INVALID_STATE', 'Paket ini sudah tidak aktif.');

		/* --------------------------- Layanan tambahan --------------------------- */
		const extraRows: { serviceId: string; label: string; quantity: number; unitPrice: string }[] = [];
		const seen = new Set<string>();

		for (const extra of input.extras ?? []) {
			if (!extra.serviceId || seen.has(extra.serviceId)) continue;
			seen.add(extra.serviceId);

			const quantity = Math.max(1, Math.floor(extra.quantity || 1));
			const [service] = await tx
				.select()
				.from(services)
				.where(eq(services.id, extra.serviceId))
				.limit(1);
			if (!service) fail('NOT_FOUND', 'Layanan tambahan tidak ditemukan.');
			if (!service.isActive) fail('INVALID_STATE', `Layanan "${service.name}" sudah tidak aktif.`);

			extraRows.push({
				serviceId: service.id,
				label: service.name,
				quantity,
				unitPrice: service.unitPrice
			});
		}

		/* ------------------------------ Nilai kontrak ---------------------------- */
		const packagePrice = toNumber(pkg.basePrice);
		const extraTotal = extraRows.reduce(
			(acc, row) => acc + toNumber(row.unitPrice) * row.quantity,
			0
		);
		const total = rupiah(packagePrice + extraTotal);
		if (total <= 0) {
			fail(
				'INVALID_STATE',
				'Paket ini tidak punya harga. Isi harga paket di katalog sebelum membuat order.'
			);
		}

		const dpPct = toNumber(pkg.downPaymentPct);
		const dpAmount = rupiah((total * dpPct) / 100);
		const finalAmount = total - dpAmount;

		/* -------------------------------- Order -------------------------------- */
		const orderNumber = await nextNumber(tx, 'ORD');
		const [order] = await tx
			.insert(orders)
			.values({
				orderNumber,
				authorId: author.id,
				packageId: pkg.id,
				status: 'AWAITING_DOWN_PAYMENT',
				bookTitle: title,
				bookSubtitle: input.bookSubtitle?.trim() || null,
				totalAmount: toMoneyString(total),
				downPaymentPct: pkg.downPaymentPct,
				authorRoyaltyPct: pkg.authorRoyaltyPct,
				maxCoverRevisions: pkg.maxCoverRevisions,
				maxLayoutRevisions: pkg.maxLayoutRevisions,
				notes: input.notes?.trim() || null,
				createdBy: input.createdBy
			})
			.returning({ id: orders.id });

		if (!order) fail('INVALID_STATE', 'Gagal membuat order.');

		/* --------------------------------- Item -------------------------------- */
		await tx.insert(orderItems).values([
			{
				orderId: order.id,
				label: `${pkg.name} — ${pkg.code}`,
				quantity: 1,
				unitPrice: toMoneyString(packagePrice),
				subtotal: toMoneyString(packagePrice)
			},
			...extraRows.map((row) => ({
				orderId: order.id,
				serviceId: row.serviceId,
				label: row.label,
				quantity: row.quantity,
				unitPrice: row.unitPrice,
				subtotal: toMoneyString(toNumber(row.unitPrice) * row.quantity)
			}))
		]);

		/* ------------------------------- Invoice ------------------------------- */
		const dueDays = Number.isFinite(input.dueInDays) ? Math.max(1, input.dueInDays ?? 14) : 14;
		const dueDate = new Date(Date.now() + dueDays * 86_400_000).toISOString().slice(0, 10);
		const invoiceNumbers: string[] = [];

		const dpNumber = await nextNumber(tx, 'INV');
		invoiceNumbers.push(dpNumber);
		await tx.insert(invoices).values({
			invoiceNumber: dpNumber,
			orderId: order.id,
			kind: 'DOWN_PAYMENT',
			status: 'UNPAID',
			milestonePct: pkg.downPaymentPct,
			amount: toMoneyString(dpAmount),
			description: `Uang muka ${Number(dpPct)}% — ${title}`,
			dueDate
		});

		/*
		 * Pelunasan hanya dibuat bila ada sisa. Paket dengan DP 100% tidak perlu
		 * invoice kedua yang bernilai nol — invoice nol membingungkan saat
		 * verifikasi karena tidak ada uang yang harus masuk.
		 */
		if (finalAmount > 0) {
			const finalNumber = await nextNumber(tx, 'INV');
			invoiceNumbers.push(finalNumber);
			await tx.insert(invoices).values({
				invoiceNumber: finalNumber,
				orderId: order.id,
				kind: 'FINAL_SETTLEMENT',
				status: 'UNPAID',
				milestonePct: toMoneyString(100 - dpPct),
				amount: toMoneyString(finalAmount),
				description: `Pelunasan — ${title}`,
				/* Jatuh tempo pelunasan mengikuti selesainya produksi, bukan hari ini. */
				dueDate: null
			});
		}

		return {
			orderId: order.id,
			orderNumber,
			totalAmount: toMoneyString(total),
			downPaymentAmount: toMoneyString(dpAmount),
			finalAmount: toMoneyString(finalAmount),
			invoiceNumbers
		};
	});
}

/**
 * Membatalkan order yang salah dibuat.
 *
 * Dit refuse bila sudah ada pembayaran terverifikasi: uang yang sudah masuk
 * harus dibalik lewat finance agar jejaknya tercatat, bukan dihapus diam-diam.
 */
export async function cancelOrder(orderId: string, reason: string): Promise<{ orderNumber: string }> {
	return db.transaction(async (tx) => {
		const [order] = await tx
			.select()
			.from(orders)
			.where(eq(orders.id, orderId))
			.for('update')
			.limit(1);
		if (!order) fail('NOT_FOUND', 'Order tidak ditemukan.');
		if (order.status === 'COMPLETED') {
			fail('INVALID_STATE', 'Order yang sudah selesai tidak bisa dibatalkan.');
		}

		const [paid] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(invoices)
			.where(and(eq(invoices.orderId, orderId), eq(invoices.status, 'PAID')));

		if ((paid?.count ?? 0) > 0) {
			fail(
				'INVALID_STATE',
				'Order ini sudah punya pembayaran terverifikasi. Batalkan lewat finance agar jejaknya tercatat.'
			);
		}

		await tx
			.update(orders)
			.set({ status: 'CANCELLED', notes: reason, updatedAt: new Date() })
			.where(eq(orders.id, orderId));

		await tx
			.update(invoices)
			.set({ status: 'VOID' })
			.where(and(eq(invoices.orderId, orderId), eq(invoices.status, 'UNPAID')));

		return { orderNumber: order.orderNumber };
	});
}
