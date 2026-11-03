import { redirect } from '@sveltejs/kit';
import { clearDevSession } from '$lib/server/auth/devSession';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.supabase) {
		await locals.supabase.auth.signOut();
	}
	clearDevSession(cookies);
	/** Bersihkan sisa cookie sesi Supabase (sb-*-auth-token). */
	for (const cookie of cookies.getAll()) {
		if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
			cookies.delete(cookie.name, { path: '/' });
		}
	}
	redirect(303, '/login');
};
