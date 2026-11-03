import { fail, redirect } from '@sveltejs/kit';
import { ROLE_HOME } from '$lib/server/auth/rbac';
import {
	isDevAuthEnabled,
	setDevSession,
	verifyDevCredentials
} from '$lib/server/auth/devSession';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.profile) {
		redirect(303, ROLE_HOME[locals.profile.role]);
	}
	return {
		redirectTo: url.searchParams.get('redirectTo') ?? '',
		errorMessage: url.searchParams.get('error'),
		devAuth: isDevAuthEnabled()
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const redirectTo = String(form.get('redirectTo') ?? '');

		if (!email || !password) {
			return fail(400, { email, message: 'Email dan kata sandi wajib diisi.' });
		}

		if (isDevAuthEnabled()) {
			const userId = await verifyDevCredentials(email, password);
			if (!userId) {
				return fail(400, { email, message: 'Email atau kata sandi salah. Silakan coba lagi.' });
			}
			setDevSession(cookies, userId);
			redirect(303, safeRedirect(redirectTo) ?? '/');
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return fail(400, { email, message: 'Email atau kata sandi salah. Silakan coba lagi.' });
		}

		redirect(303, safeRedirect(redirectTo) ?? '/');
	}
};

/** Hanya izinkan path internal agar tidak bisa dipakai open redirect. */
function safeRedirect(redirectTo: string): string | null {
	return redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
		? redirectTo
		: null;
}
