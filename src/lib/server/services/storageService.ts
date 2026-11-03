import {
	v2 as cloudinary,
	type UploadApiOptions,
	type UploadApiResponse,
	type TransformationOptions
} from 'cloudinary';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { db } from '$db';
import { bookProjects, fileAssets } from '$db/schema';
import { eq } from 'drizzle-orm';
import { MAX_UPLOAD_BYTES, STORAGE_BUCKETS, type BucketName } from '../storage.constants';
import type { FolderOptions, PreviewOptions, SignedDownload, SignedUpload } from './storage.types';

/* -------------------------------------------------------------------------- */
/*                                 CLOUDINARY                                 */
/* -------------------------------------------------------------------------- */

let cloudinaryReady = false;

function getCloudinary() {
	if (!cloudinaryReady) {
		const url = env.CLOUDINARY_URL;
		if (!url) throw new Error('[storage] CLOUDINARY_URL belum diset.');
		if (url.startsWith('cloudinary://')) {
			// Cloudinary membaca CLOUDINARY_URL otomatis, tetapi kita set eksplisit
			// agar perilakunya deterministik di serverless/runtime apa pun.
			cloudinary.config({ secure: true });
		} else {
			throw new Error('[storage] CLOUDINARY_URL harus berformat cloudinary://key:secret@cloud');
		}
		cloudinaryReady = true;
	}
	return cloudinary;
}

/** Folder per proyek agar aset mudah diaudit & dibersihkan. */
function projectFolder(projectId: string, sub: string): string {
	return `publisher/${projectId}/${sub}`;
}

/**
 * Unggah gambar cover (draft maupun final) ke Cloudinary.
 * File besar di-stream sebagai base64/URL; untuk cover (<10MB) cukup buffer.
 */
export async function uploadCoverImage(
	buffer: Buffer | string,
	options: FolderOptions & { publicId?: string }
): Promise<UploadApiResponse> {
	const cld = getCloudinary();
	const uploadOptions: UploadApiOptions = {
		folder: projectFolder(options.projectId, options.subfolder ?? 'cover'),
		public_id: options.publicId,
		resource_type: 'image',
		overwrite: true,
		invalidate: true,
		/** Simpan versi master tanpa transformasi destruktif. */
		quality: 'auto:best'
	};
	return new Promise((resolve, reject) => {
		const stream = cld.uploader.upload_stream(uploadOptions, (error, result) => {
			if (error || !result) return reject(error ?? new Error('Upload Cloudinary gagal.'));
			resolve(result);
		});
		if (typeof buffer === 'string') {
			stream.end(Buffer.from(buffer));
		} else {
			stream.end(buffer);
		}
	});
}

/** Watermark teks diagonal + resolusi rendah untuk preview penulis. */
function watermarkTransformation(opts: PreviewOptions): TransformationOptions[] {
	const label = opts.watermarkText ?? 'PREVIEW';
	const encoded = encodeURIComponent(label)
		.replace(/%20/g, '%20')
		.replace(/'/g, '%27');
	return [
		{ width: opts.width ?? 900, crop: 'limit', quality: 'auto:low', fetch_format: 'auto' },
		{
			overlay: { font_family: 'Arial', font_size: 42, font_weight: 'bold', text: encoded },
			color: '#ffffff',
			opacity: 55,
			gravity: 'center',
			angle: -30
		},
		{
			overlay: { font_family: 'Arial', font_size: 16, text: encoded },
			color: '#ffffff',
			opacity: 70,
			gravity: 'south_east',
			x: 24,
			y: 24
		}
	];
}

/**
 * URL preview berwatermark. AMAN dibagikan ke penulis kapan pun.
 */
export function getWatermarkedPreviewUrl(
	publicId: string,
	options: PreviewOptions = {}
): string {
	const cld = getCloudinary();
	return cld.url(publicId, {
		secure: true,
		transformation: watermarkTransformation(options)
	});
}

/**
 * URL master tanpa watermark. HANYA boleh dipanggil setelah
 * `assertHighResUnlocked()` lolos.
 */
export function getMasterUrl(publicId: string, format?: string): string {
	const cld = getCloudinary();
	return cld.url(publicId, {
		secure: true,
		format,
		transformation: [{ quality: 'auto:best' }]
	});
}

/* -------------------------------------------------------------------------- */
/*                              SUPABASE STORAGE                              */
/* -------------------------------------------------------------------------- */

let supabaseAdmin: SupabaseClient | null = null;

/**
 * Server-only client memakai service role key agar dapat membuat signed URL
 * untuk bucket privat. JANGAN pernah mengirim client ini ke browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
	if (supabaseAdmin) return supabaseAdmin;
	const url = env.PUBLIC_SUPABASE_URL;
	const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceKey) {
		throw new Error('[storage] PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset.');
	}
	supabaseAdmin = createClient(url, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return supabaseAdmin;
}

function assertUploadSize(sizeBytes: number): void {
	if (sizeBytes > MAX_UPLOAD_BYTES) {
		throw new Error(
			`[storage] Ukuran file ${(sizeBytes / 1024 / 1024).toFixed(1)}MB melebihi batas 50MB.`
		);
	}
}

/** Path deterministik: <projectId>/<kind>/<timestamp>-<slug>.<ext> */
function buildStoragePath(projectId: string, fileName: string): string {
	const safe = fileName
		.toLowerCase()
		.replace(/[^a-z0-9.\-_]/g, '-')
		.replace(/-+/g, '-');
	return `${projectId}/${Date.now()}-${safe}`;
}

/**
 * Signed upload URL — browser mengunggah langsung ke Supabase Storage
 * tanpa melewati server (hemat bandwidth, aman untuk file 50MB).
 */
export async function createSignedUpload(params: {
	bucket: BucketName;
	projectId: string;
	fileName: string;
	sizeBytes: number;
}): Promise<SignedUpload> {
	assertUploadSize(params.sizeBytes);
	const path = buildStoragePath(params.projectId, params.fileName);
	const { data, error } = await getSupabaseAdmin()
		.storage.from(params.bucket)
		.createSignedUploadUrl(path);
	if (error || !data) {
		throw new Error(`[storage] Gagal membuat signed upload URL: ${error?.message ?? 'unknown'}`);
	}
	return {
		bucket: params.bucket,
		path: data.path,
		token: data.token,
		signedUrl: data.signedUrl
	};
}

/** Signed download URL (default 60 detik) untuk file privat. */
export async function createSignedDownload(
	bucket: BucketName,
	path: string,
	expiresInSeconds = 60
): Promise<SignedDownload> {
	const { data, error } = await getSupabaseAdmin()
		.storage.from(bucket)
		.createSignedUrl(path, expiresInSeconds);
	if (error || !data) {
		throw new Error(`[storage] Gagal membuat signed URL: ${error?.message ?? 'unknown'}`);
	}
	return { signedUrl: data.signedUrl, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
}

/** Signed URL massal untuk daftar file (mis. halaman arsip proyek). */
export async function createSignedDownloads(
	bucket: BucketName,
	paths: string[],
	expiresInSeconds = 60
): Promise<Record<string, string>> {
	if (paths.length === 0) return {};
	const { data, error } = await getSupabaseAdmin()
		.storage.from(bucket)
		.createSignedUrls(paths, expiresInSeconds);
	if (error || !data) {
		throw new Error(`[storage] Gagal membuat signed URLs: ${error?.message ?? 'unknown'}`);
	}
	return Object.fromEntries(
		data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl as string])
	);
}

/* -------------------------------------------------------------------------- */
/*                        UNLOCK GATE — SINGLE SOURCE OF TRUTH                */
/* -------------------------------------------------------------------------- */

/**
 * Penjaga tunggal: file master hanya boleh diakses ketika order sudah lunas
 * 100% DAN proyek sudah melewati approval.
 */
export async function assertHighResUnlocked(fileAssetId: string): Promise<void> {
	const [asset] = await db
		.select({
			requiresFullPayment: fileAssets.requiresFullPayment,
			isPreview: fileAssets.isPreview
		})
		.from(fileAssets)
		.where(eq(fileAssets.id, fileAssetId))
		.limit(1);

	if (!asset) throw new Error('[storage] Aset file tidak ditemukan.');
	if (asset.isPreview) {
		throw new Error('[storage] Aset ini adalah preview, bukan file master.');
	}
	if (!asset.requiresFullPayment) return;

	const [row] = await db
		.select({ unlocked: bookProjects.highResUnlocked })
		.from(fileAssets)
		.innerJoin(bookProjects, eq(bookProjects.id, fileAssets.projectId))
		.where(eq(fileAssets.id, fileAssetId))
		.limit(1);

	if (!row?.unlocked) {
		throw new Error(
			'[storage] File resolusi tinggi terkunci. Selesaikan pelunasan untuk membuka akses.'
		);
	}
}

/**
 * Resolusi URL yang aman untuk sebuah aset, menghormati status pembayaran.
 * Ini satu-satunya fungsi yang boleh dipanggil route handler untuk menampilkan file.
 */
export async function resolveAssetUrl(
	asset: {
		id: string;
		storageProvider: 'SUPABASE' | 'CLOUDINARY';
		isPreview: boolean;
		requiresFullPayment: boolean;
		bucket: string | null;
		storagePath: string | null;
		cloudinaryPublicId: string | null;
		cloudinaryFormat: string | null;
	},
	options: { allowMaster: boolean }
): Promise<string> {
	if (asset.storageProvider === 'CLOUDINARY') {
		if (!asset.cloudinaryPublicId) throw new Error('[storage] public_id Cloudinary kosong.');
		if (asset.isPreview || !options.allowMaster) {
			return getWatermarkedPreviewUrl(asset.cloudinaryPublicId);
		}
		return getMasterUrl(asset.cloudinaryPublicId, asset.cloudinaryFormat ?? undefined);
	}

	if (!asset.bucket || !asset.storagePath) {
		throw new Error('[storage] Metadata Supabase Storage tidak lengkap.');
	}
	if (asset.requiresFullPayment && !options.allowMaster) {
		throw new Error('[storage] Akses file master memerlukan pelunasan penuh.');
	}
	const { signedUrl } = await createSignedDownload(asset.bucket as BucketName, asset.storagePath);
	return signedUrl;
}

export { STORAGE_BUCKETS };
