import { error } from '@sveltejs/kit';
import { authorBooks, authorOrders, authorOverview } from '$lib/server/services/authors';
import type { PageServerLoad } from './$types';

const VIEW_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;

/**
 * Profil 360 seorang penulis.
 *
 * Direktori menjawab "siapa saja penulis kami"; halaman ini menjawab "penulis
 * ini bagaimana". Semua angka diambil dari baris nyata: order, nilai kontrak,
 * royalti, buku, dan sentuhan CRM terakhir — tidak ada skor yang disimpan.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const role = locals.profile?.role;
	if (!role || !VIEW_ROLES.includes(role as (typeof VIEW_ROLES)[number])) {
		error(403, 'Profil penulis hanya untuk tim internal penerbitan.');
	}

	const [author, orders, books] = await Promise.all([
		authorOverview(params.id),
		authorOrders(params.id),
		authorBooks(params.id)
	]);

	if (!author) error(404, 'Penulis tidak ditemukan.');

	return { author, orders, books };
};
