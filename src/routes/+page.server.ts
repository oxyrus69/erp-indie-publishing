import { redirect } from '@sveltejs/kit';
import { ROLE_HOME } from '$lib/server/auth/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	redirect(303, locals.profile ? ROLE_HOME[locals.profile.role] : '/login');
};
