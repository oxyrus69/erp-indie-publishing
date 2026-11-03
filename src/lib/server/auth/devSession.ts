import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, pgClient } from '$db';
import { profiles, type Profile } from '$db/schema';

/**
 * Sesi lokal untuk pengembangan.
 *
 * Aplikasi produksi memakai Supabase Auth (GoTrue). Ketika kunci anon belum
 * diisi — kondisi normal saat proyek baru di-clone — tidak ada request yang
 * bisa lolos `getUser()`. Untuk menjaga alur kerja tetap bisa diuji, mode ini
 * memverifikasi kata sandi langsung ke hash bcrypt di `auth.users` memakai
 * `pgcrypto`. Tidak ada bypass: kredensial yang salah tetap ditolak, dan
 * modul ini tidak pernah aktif bila `NODE_ENV=production`.
 */

export const DEV_SESSION_COOKIE = 'erp-dev-session';

/** Aktif hanya di luar produksi dan hanya bila Supabase belum dikonfigurasi. */
export function isDevAuthEnabled(): boolean {
	if (env.NODE_ENV === 'production') return false;
	const hasKey =
		Boolean(env.PUBLIC_SUPABASE_ANON_KEY) || Boolean(env.SUPABASE_ANON_KEY ?? undefined);
	return !hasKey;
}

/**
 * Memeriksa email + kata sandi terhadap hash di `auth.users`.
 * Mengembalikan id user bila cocok, atau `null`.
 */
export async function verifyDevCredentials(
	email: string,
	password: string
): Promise<string | null> {
	const normalized = email.trim().toLowerCase();
	if (!normalized || !password) return null;

	const rows = await pgClient`
		select u.id::text as id
		from auth.users u
		where lower(u.email) = ${normalized}
			and u.encrypted_password is not null
			and u.encrypted_password = extensions.crypt(${password}, u.encrypted_password)
		limit 1
	`;
	return rows[0]?.id ?? null;
}

export function setDevSession(cookies: Cookies, userId: string): void {
	cookies.set(DEV_SESSION_COOKIE, userId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 24 * 7
	});
}

export function clearDevSession(cookies: Cookies): void {
	cookies.delete(DEV_SESSION_COOKIE, { path: '/' });
}

/** Profil untuk sesi lokal; `null` bila cookie tidak valid atau sudah dihapus. */
export async function loadDevProfile(userId: string): Promise<Profile | null> {
	const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
	return profile ?? null;
}
