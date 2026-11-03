import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { db } from '$db';
import { profiles, type UserRole } from '$db/schema';
import { eq } from 'drizzle-orm';
import { isPublicPath, ROLE_HOME } from '$lib/server/auth/rbac';
import {
	DEV_SESSION_COOKIE,
	isDevAuthEnabled,
	loadDevProfile
} from '$lib/server/auth/devSession';

/**
 * 0) Sesi lokal pengembangan (hanya bila Supabase belum dikonfigurasi).
 * Tidak pernah aktif di produksi; kredensial tetap divalidasi ke hash bcrypt.
 */
const devSessionHandle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.profile = null;

	if (!isDevAuthEnabled()) return resolve(event);

	const userId = event.cookies.get(DEV_SESSION_COOKIE);
	if (!userId) return resolve(event);

	const profile = await loadDevProfile(userId);
	if (!profile) {
		event.cookies.delete(DEV_SESSION_COOKIE, { path: '/' });
		return resolve(event);
	}

	event.locals.devSession = true;
	event.locals.user = { id: profile.id, email: profile.email };
	event.locals.profile = profile;
	return resolve(event);
};

/**
 * 1) Sesi Supabase + profil aplikasi.
 * Memakai `getUser()` (bukan `getSession()`) agar token divalidasi ke server
 * Supabase — `getSession()` saja dapat dipalsukan lewat cookie.
 */
const authHandle: Handle = async ({ event, resolve }) => {
	if (event.locals.user) return resolve(event);

	if (!isDevAuthEnabled()) {
		event.locals.supabase = createSupabaseServerClient(event);
	} else {
		/* Tanpa kunci Supabase, client tidak bisa dibuat — cukup lewati. */
		return resolve(event);
	}

	const {
		data: { user },
		error
	} = await event.locals.supabase.auth.getUser();

	if (error || !user) {
		return resolve(event);
	}

	event.locals.user = { id: user.id, email: user.email ?? '' };

	const [profile] = await db
		.select()
		.from(profiles)
		.where(eq(profiles.id, user.id))
		.limit(1);

	if (profile) {
		event.locals.profile = profile;
	} else {
		/*
		 * Pengguna auth tanpa profil: bisa terjadi bila trigger sync belum
		 * dipasang. Kita tidak auto-membuat profil karena role tidak boleh
		 * ditentukan dari klien — akses ditolak sampai admin menautkan profil.
		 */
		event.locals.profile = null;
	}

	return resolve(event);
};

/**
 * 2) Penjaga akses dasar.
 * - Rute belum login + tidak publik → redirect ke /login?redirectTo=...
 * - Sudah login tetapi mengakses /login → redirect ke home sesuai role.
 *
 * Pemeriksaan peran sengaja TIDAK dilakukan di sini: galat yang dilempar dari
 * hook hanya bisa dirender sebagai `error.html` tanpa gaya aplikasi. Otorisasi
 * peran dijalankan di `(app)/+layout.server.ts` supaya 403 tampil sebagai
 * halaman galat penuh.
 */
const guardHandle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const profile = event.locals.profile;
	const role: UserRole | null = profile?.role ?? null;

	if (pathname.startsWith('/api/')) {
		/* API dilindungi di masing-masing endpoint agar bisa membalas JSON 401/403. */
		return resolve(event);
	}

	if (isPublicPath(pathname)) {
		if (pathname.startsWith('/login') && profile) {
			redirect(303, ROLE_HOME[profile.role]);
		}
		return resolve(event);
	}

	if (!event.locals.user) {
		const redirectTo = encodeURIComponent(pathname + event.url.search);
		redirect(303, `/login?redirectTo=${redirectTo}`);
	}

	if (!profile) {
		redirect(303, '/login?error=profil-tidak-ditemukan');
	}

	return resolve(event);
};

/** Teruskan cookie sesi yang diperbarui ke response. */
const sessionCookieHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
	return response;
};

export const handle = sequence(devSessionHandle, authHandle, guardHandle, sessionCookieHandle);

/** Helper untuk endpoint API: memastikan user login & role sesuai. */
export function requireUser(event: RequestEvent) {
	if (!event.locals.user || !event.locals.profile) {
		return null;
	}
	return { user: event.locals.user, profile: event.locals.profile };
}
