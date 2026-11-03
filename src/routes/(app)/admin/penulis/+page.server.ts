import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import { bookProjects, orders, profiles } from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import { audit } from '$lib/server/services/auditDraft';
import { createAccount } from '$lib/server/services/accounts';
import { ErpError } from '$lib/server/services/erpErrors';
import type { Actions, PageServerLoad } from './$types';

const PM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Direktori penulis.
 *
 * Tanpa ini, order hanya bisa dibuat untuk penulis yang kebetulan ada di seed.
 * Halaman ini menutup rantai: tambah penulis → buat order → DP → produksi.
 *
 * Akun penulis dibuat aktif tanpa kata sandi; mereka masuk lewat portal
 * (Supabase Auth atau dev session). Yang dibutuhkan alur order hanyalah baris
 * profil dengan peran AUTHOR.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
		error(403, 'Direktori penulis hanya untuk Project Manager.');
	}

	const q = (url.searchParams.get('q') ?? '').trim();

	const conditions: SQL[] = [eq(profiles.role, 'AUTHOR')];
	if (q) {
		const pattern = `%${q}%`;
		const search = or(ilike(profiles.fullName, pattern), ilike(profiles.email, pattern));
		if (search) conditions.push(search);
	}

	const rows = await db
		.select({
			id: profiles.id,
			fullName: profiles.fullName,
			email: profiles.email,
			phone: profiles.phone,
			isActive: profiles.isActive,
			createdAt: profiles.createdAt
		})
		.from(profiles)
		.where(and(...conditions))
		.orderBy(asc(profiles.fullName));

	/* Ringkasan kontrak per penulis, diambil sekali untuk semua baris. */
	const perAuthor = rows.length
		? await db
				.select({
					authorId: orders.authorId,
					orderCount: sql<number>`count(distinct ${orders.id})::int`,
					bookCount: sql<number>`count(distinct ${bookProjects.id})::int`,
					contractValue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`
				})
				.from(orders)
				.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
				.where(inArray(orders.authorId, rows.map((r) => r.id)))
				.groupBy(orders.authorId)
		: [];

	const statBy = new Map(perAuthor.map((row) => [row.authorId, row]));

	return {
		authors: rows.map((row) => {
			const stat = statBy.get(row.id);
			return {
				...row,
				orderCount: stat?.orderCount ?? 0,
				bookCount: stat?.bookCount ?? 0,
				contractValue: toNumber(stat?.contractValue ?? 0)
			};
		}),
		filter: { q }
	};
};

export const actions: Actions = {
	/** Menambahkan akun penulis baru. */
	create: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menambah penulis.' });
		}

		const form = await request.formData();
		const fullName = String(form.get('fullName') ?? '').trim();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const phone = String(form.get('phone') ?? '').trim() || null;

		if (fullName.length < 3) return fail(400, { message: 'Nama lengkap minimal 3 karakter.' });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return fail(400, { message: 'Alamat email tidak valid.' });
		}

		try {
			const created = await createAccount({
				email,
				fullName,
				role: 'AUTHOR',
				phone
			});

			await audit({
				actor: profile,
				action: 'author.invited',
				entityType: 'user',
				entityId: created.id,
				summary: `Menambahkan penulis ${fullName} (${email}) dan mengaktifkan portalnya.`,
				context: { email, phone }
			});

			return {
				ok: true,
				message: `${fullName} ditambahkan. Sekarang bisa dipilih saat membuat order.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Memperbarui data penulis atau menonaktifkan portalnya. */
	update: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah penulis.' });
		}

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const fullName = String(form.get('fullName') ?? '').trim();
		const phone = String(form.get('phone') ?? '').trim() || null;
		const isActive = form.get('isActive') === 'on';

		if (!id) return fail(400, { message: 'Penulis tidak dipilih.' });
		if (fullName.length < 3) return fail(400, { message: 'Nama lengkap minimal 3 karakter.' });

		try {
			const [before] = await db
				.select({ role: profiles.role, isActive: profiles.isActive, fullName: profiles.fullName })
				.from(profiles)
				.where(eq(profiles.id, id))
				.limit(1);

			if (!before) return fail(404, { message: 'Penulis tidak ditemukan.' });
			if (before.role !== 'AUTHOR') return fail(400, { message: 'Akun ini bukan penulis.' });

			/*
			 * Menonaktifkan penulis yang masih punya proyek berjalan akan memutus
			 * akses review di tengah produksi. Ditolak dengan alasan yang jelas.
			 */
			if (before.isActive && !isActive) {
				const [busy] = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(orders)
					.where(
						and(
							eq(orders.authorId, id),
							sql`${orders.status} in ('IN_PRODUCTION', 'AWAITING_FINAL_SETTLEMENT', 'READY_FOR_RELEASE', 'AWAITING_DOWN_PAYMENT')`
						)
					);
				if ((busy?.count ?? 0) > 0) {
					return fail(422, {
						message: `Penulis ini masih punya ${busy!.count} order berjalan. Selesaikan atau batalkan ordernya dulu.`
					});
				}
			}

			await db
				.update(profiles)
				.set({ fullName, phone, isActive, updatedAt: new Date() })
				.where(eq(profiles.id, id));

			await audit({
				actor: profile,
				action: 'author.invited',
				entityType: 'user',
				entityId: id,
				summary: `Memperbarui penulis ${fullName}${before.isActive !== isActive ? (isActive ? ' — portal diaktifkan' : ' — portal dinonaktifkan') : ''}.`,
				changes: { isActive: { from: before.isActive, to: isActive } }
			});

			return { ok: true, message: `${fullName} diperbarui.` };
		} catch (e) {
			return toFailure(e);
		}
	}
};
