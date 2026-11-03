import { and, desc, eq, isNull } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '$db';
import { notifications } from '$db/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Daftar lengkap notifikasi.
 *
 * Sinkronisasi & lencana sudah dikerjakan layout (sekali per muat halaman),
 * jadi halaman ini cukup membaca daftar penuh. Menyinkronkan ulang di sini
 * hanya akan menggandakan query yang sama.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.profile;
	if (!profile) return { items: [] };

	const items = await db
		.select({
			id: notifications.id,
			category: notifications.category,
			severity: notifications.severity,
			title: notifications.title,
			body: notifications.body,
			href: notifications.href,
			readAt: notifications.readAt,
			createdAt: notifications.createdAt
		})
		.from(notifications)
		.where(eq(notifications.userId, profile.id))
		.orderBy(desc(notifications.createdAt))
		.limit(100);

	return { items };
};

export const actions: Actions = {
	/** Tandai satu notifikasi sudah dibaca. */
	read: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile) return fail(401, { message: 'Silakan masuk terlebih dahulu.' });

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Notifikasi tidak dipilih.' });

		/* Filter per pemilik: pengguna tidak bisa menandai notifikasi orang lain. */
		await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(and(eq(notifications.id, id), eq(notifications.userId, profile.id)));

		return { ok: true };
	},

	/** Tandai semua sudah dibaca. */
	'read-all': async ({ locals }) => {
		const profile = locals.profile;
		if (!profile) return fail(401, { message: 'Silakan masuk terlebih dahulu.' });

		const updated = await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(and(eq(notifications.userId, profile.id), isNull(notifications.readAt)))
			.returning({ id: notifications.id });

		return { ok: true, message: `${updated.length} notifikasi ditandai dibaca.` };
	}
};
