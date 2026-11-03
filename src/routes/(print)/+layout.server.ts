import { error } from '@sveltejs/kit';
import { hasRole, resolveRouteRoles } from '$lib/server/auth/rbac';
import type { LayoutServerLoad } from './$types';

/**
 * Dokumen cetak hidup di grup rute sendiri supaya tidak memakai AppShell
 * (tanpa sidebar/topbar, sehingga bersih sejak layar).
 *
 * Konsekuensinya, pemeriksaan peran di `(app)/+layout.server.ts` tidak ikut
 * berjalan. Penjaga yang sama diulang di sini agar halaman cetak tidak menjadi
 * celah: laporan keuangan tetap hanya untuk peran yang berwenang.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const profile = locals.profile;
	if (!profile) error(401, 'Silakan masuk terlebih dahulu.');

	const { matched, roles } = resolveRouteRoles(url.pathname);
	if (matched && !hasRole(profile.role, roles)) {
		error(403, 'Peran akun Anda tidak berwenang membuka dokumen ini.');
	}

	return { profile };
};
