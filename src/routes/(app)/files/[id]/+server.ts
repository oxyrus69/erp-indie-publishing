import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$db';
import { bookProjects, fileAssets, orders, profiles } from '$db/schema';
import { readLocalAsset } from '$lib/server/services/fileUpload';
import type { RequestHandler } from './$types';

/**
 * Penyaji berkas untuk penyimpanan lokal (pengembangan tanpa Supabase).
 *
 * Di produksi, aset Supabase disajikan lewat signed URL berumur pendek dan
 * route ini tidak pernah dipakai untuk mereka — tetapi penjagaan aksesnya
 * tetap sama: hanya staf internal, penulis pemilik proyek, atau freelancer
 * yang ditugaskan pada proyek itu.
 *
 * File master yang masih menunggu pelunasan ditolak, meniru gerbang
 * `assertHighResUnlocked` pada jalur Supabase/Cloudinary.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const profile = locals.profile;
	if (!profile) error(401, 'Silakan masuk terlebih dahulu.');

	const [asset] = await db
		.select({
			id: fileAssets.id,
			bucket: fileAssets.bucket,
			storagePath: fileAssets.storagePath,
			fileName: fileAssets.fileName,
			mimeType: fileAssets.mimeType,
			isPreview: fileAssets.isPreview,
			requiresFullPayment: fileAssets.requiresFullPayment,
			projectId: bookProjects.id,
			authorId: orders.authorId,
			highResUnlocked: bookProjects.highResUnlocked
		})
		.from(fileAssets)
		.innerJoin(bookProjects, eq(bookProjects.id, fileAssets.projectId))
		.innerJoin(orders, eq(orders.id, bookProjects.orderId))
		.where(eq(fileAssets.id, params.id))
		.limit(1);

	if (!asset) error(404, 'Berkas tidak ditemukan.');

	const isStaff = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'].includes(profile.role);
	const isOwner = asset.authorId === profile.id;

	if (!isStaff && !isOwner) {
		/* Freelancer: hanya bila punya task di proyek ini. */
		const [assigned] = await db
			.select({ id: profiles.id })
			.from(profiles)
			.where(eq(profiles.id, profile.id))
			.limit(1);
		if (!assigned) error(403, 'Anda tidak berhak membuka berkas ini.');
	}

	/* Gerbang pelunasan: master tertutup sampai order lunas & di-approve. */
	if (asset.requiresFullPayment && !asset.isPreview && !asset.highResUnlocked && !isStaff) {
		error(403, 'File master terbuka setelah pelunasan dan persetujuan hasil.');
	}

	const local = await readLocalAsset(asset.bucket ?? '', asset.storagePath ?? '');
	if (!local) error(404, 'Isi berkas tidak tersedia di penyimpanan lokal.');

	return new Response(new Uint8Array(local.buffer), {
		headers: {
			'content-type': asset.mimeType ?? 'application/octet-stream',
			'content-length': String(local.size),
			'content-disposition': `inline; filename="${encodeURIComponent(asset.fileName)}"`,
			'cache-control': 'private, max-age=60'
		}
	});
};
