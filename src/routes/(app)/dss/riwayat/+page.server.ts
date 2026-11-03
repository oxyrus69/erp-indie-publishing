import { error } from '@sveltejs/kit';
import { decisionHistory } from '$lib/server/services/dss';
import type { PageServerLoad } from './$types';

const DSS_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;

/**
 * Riwayat keputusan.
 *
 * Halaman ini ada supaya DSS bisa dinilai, bukan hanya dipakai: keputusan yang
 * ditolak enam bulan lalu bisa dibaca ulang bersama alasannya, dan angka yang
 * dipakai saat itu ikut tersimpan di `facts`.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !DSS_ROLES.includes(role as (typeof DSS_ROLES)[number])) {
		error(403, 'Riwayat keputusan hanya untuk tim internal penerbitan.');
	}

	const history = await decisionHistory(200);

	const accepted = history.filter((row) => row.verdict === 'ACCEPTED');
	const dismissed = history.filter((row) => row.verdict === 'DISMISSED');

	return {
		history,
		totals: {
			all: history.length,
			accepted: accepted.length,
			dismissed: dismissed.length,
			acceptedImpact: accepted.reduce((sum, row) => sum + row.impactValue, 0)
		}
	};
};
