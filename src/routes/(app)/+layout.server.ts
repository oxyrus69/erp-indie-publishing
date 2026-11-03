import { error } from '@sveltejs/kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$db';
import { notifications } from '$db/schema';
import { hasRole, resolveRouteRoles } from '$lib/server/auth/rbac';
import { syncNotifications } from '$lib/server/services/notifications';
import type { LayoutServerLoad } from './$types';

/**
 * Pesan 403 per area, ditulis dari sudut pandang pengguna yang mencoba masuk.
 * Dipakai sebagai `message` pada halaman galat, jadi kalimatnya harus jelas
 * tanpa perlu konteks tambahan.
 */
const AREA_MESSAGE: Record<string, string> = {
	'/portal': 'Portal ini khusus untuk penulis.',
	'/freelancer': 'Ruang ini khusus untuk freelancer.',
	'/projects': 'Daftar proyek hanya dibuka untuk tim internal penerbitan.',
	'/admin': 'Dasbor ini hanya untuk tim internal penerbitan.'
};

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const profile = locals.profile;
	if (!profile) error(401, 'Silakan masuk terlebih dahulu.');

	/* Otorisasi peran dijalankan di sini, bukan di hooks, agar galatnya bisa
	 * dirender sebagai halaman penuh oleh `+error.svelte`. */
	const { matched, roles } = resolveRouteRoles(url.pathname);
	if (matched && !hasRole(profile.role, roles)) {
		const area = Object.keys(AREA_MESSAGE)
			.sort((a, b) => b.length - a.length)
			.find((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
		error(
			403,
			area
				? AREA_MESSAGE[area]
				: 'Peran akun Anda tidak berwenang membuka halaman ini.'
		);
	}

	/*
	 * Notifikasi dimuat di layout, bukan di halaman, karena lonceng hidup di
	 * topbar dan harus menampilkan isi terbaru di SETIAP halaman. Sinkronisasi
	 * dijalankan sekali di sini (insert-select berbasis himpunan) lalu daftar
	 * dibaca dengan satu query.
	 */
	await syncNotifications().catch(() => {});

	const [notifItems, unreadRows] = await Promise.all([
		db
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
			.limit(12),

		db
			.select({ count: sql<number>`count(*)::int` })
			.from(notifications)
			.where(and(eq(notifications.userId, profile.id), isNull(notifications.readAt)))
	]);

	return {
		profile,
		notifications: notifItems,
		unreadNotifications: unreadRows[0]?.count ?? 0
	};
};
