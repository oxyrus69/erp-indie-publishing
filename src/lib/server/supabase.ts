import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Membuat Supabase client yang terikat pada cookie request/response SvelteKit.
 * Token sesi diperbarui otomatis oleh `getUser()` di hooks.server.ts.
 */
export function createSupabaseServerClient(event: RequestEvent) {
	const url = publicEnv.PUBLIC_SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL;
	const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY ?? env.PUBLIC_SUPABASE_ANON_KEY;

	if (!url || !anonKey) {
		throw new Error('[auth] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY belum diset.');
	}

	return createServerClient(url, anonKey, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				for (const { name, value, options } of cookiesToSet) {
					event.cookies.set(name, value, {
						...options,
						path: options?.path ?? '/',
						httpOnly: true,
						sameSite: 'lax',
						secure: event.url.protocol === 'https:'
					});
				}
			}
		}
	});
}
