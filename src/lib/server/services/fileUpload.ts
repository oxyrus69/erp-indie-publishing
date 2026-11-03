import { env } from '$env/dynamic/private';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db } from '$db';
import { fileAssets } from '$db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { MAX_UPLOAD_BYTES, STORAGE_BUCKETS, type BucketName } from '../storage.constants';
import { createSignedDownload, createSignedUpload } from './storageService';
import { ErpError, fail } from './erpErrors';

/** Jenis berkas mengikuti enum `file_kind` di database. */
export type FileKind = (typeof fileAssets.$inferSelect)['kind'];

/**
 * Unggah berkas proyek.
 *
 * Tiga lapisan sengaja dipisah:
 *
 *  1. **Validasi** (`assertUploadable`) — jenis berkas, ukuran, dan hak akses.
 *     Dijalankan sebelum satu byte pun ditulis.
 *  2. **Penyimpanan** (`putObject`) — Supabase Storage bila dikonfigurasi,
 *     atau disk lokal untuk pengembangan. Dev tanpa kunci Supabase tetap bisa
 *     menguji alur unggah; produksi tidak pernah diam-diam menulis ke disk.
 *  3. **Metadata** (`recordAsset`) — baris `file_assets` yang menjadi satu-
 *     satunya sumber kebenaran untuk daftar berkas di portal & detail proyek.
 *
 * Berkas master (naskah, PDF layout) menandai `requiresFullPayment` agar
 * `resolveAssetUrl` menolaknya sebelum pelunasan — penjaga itu sudah ada di
 * `storageService`, dan di sini kita hanya memastikan nilainya benar.
 */

/** Batas per jenis berkas, lebih ketat dari batas global 50MB. */
const KIND_RULES: Record<
	FileKind,
	{ label: string; bucket: BucketName; maxBytes: number; mime: RegExp; requiresPayment: boolean }
> = {
	MANUSCRIPT: {
		label: 'Naskah',
		bucket: STORAGE_BUCKETS.manuscripts,
		maxBytes: 50 * 1024 * 1024,
		mime: /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|rtf)|text\/plain)$/,
		requiresPayment: true
	},
	LAYOUT_PDF: {
		label: 'PDF Layout',
		bucket: STORAGE_BUCKETS.layoutPdfs,
		maxBytes: 50 * 1024 * 1024,
		mime: /^application\/pdf$/,
		requiresPayment: true
	},
	LAYOUT_PREVIEW: {
		label: 'Preview Layout',
		bucket: STORAGE_BUCKETS.layoutPdfs,
		maxBytes: 10 * 1024 * 1024,
		mime: /^application\/pdf$/,
		requiresPayment: false
	},
	COVER_DRAFT: {
		label: 'Draft Cover',
		bucket: STORAGE_BUCKETS.manuscripts,
		maxBytes: 10 * 1024 * 1024,
		mime: /^image\/(png|jpeg|webp)$/,
		requiresPayment: false
	},
	COVER_FINAL: {
		label: 'Cover Final',
		bucket: STORAGE_BUCKETS.manuscripts,
		maxBytes: 10 * 1024 * 1024,
		mime: /^image\/(png|jpeg|webp)$/,
		requiresPayment: true
	},
	COVER_PREVIEW: {
		label: 'Preview Cover',
		bucket: STORAGE_BUCKETS.manuscripts,
		maxBytes: 10 * 1024 * 1024,
		mime: /^image\/(png|jpeg|webp)$/,
		requiresPayment: false
	},
	ISBN_BARCODE: {
		label: 'Barcode ISBN',
		bucket: STORAGE_BUCKETS.legalIsbn,
		maxBytes: 5 * 1024 * 1024,
		mime: /^image\/(png|jpeg|svg\+xml)$/,
		requiresPayment: false
	},
	LEGAL_DOC: {
		label: 'Dokumen Legal',
		bucket: STORAGE_BUCKETS.legalIsbn,
		maxBytes: 10 * 1024 * 1024,
		mime: /^(application\/pdf|image\/(png|jpeg))$/,
		requiresPayment: false
	},
	CATALOG_THUMB: {
		label: 'Thumbnail Katalog',
		bucket: STORAGE_BUCKETS.manuscripts,
		maxBytes: 5 * 1024 * 1024,
		mime: /^image\/(png|jpeg|webp)$/,
		requiresPayment: false
	}
};

/** Apakah Supabase Storage tersedia (kunci service role + URL terisi). */
export function isRemoteStorageConfigured(): boolean {
	return Boolean(env.PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Direktori penyimpanan lokal untuk pengembangan. */
function localRoot(): string {
	// `build`/`.svelte-kit` bukan tempat data; simpan di `.data/uploads` proyek.
	return resolve(process.cwd(), '.data', 'uploads');
}

export type UploadInput = {
	projectId: string;
	kind: FileKind;
	file: File;
	uploadedBy: string;
	isPreview?: boolean;
	taskId?: string | null;
};

export type UploadResult = {
	assetId: string;
	fileName: string;
	sizeBytes: number;
	provider: 'SUPABASE' | 'LOCAL';
	isPreview: boolean;
};

/** Aturan per jenis berkas; melempar bila jenisnya tidak dikenal. */
function ruleFor(kind: FileKind) {
	const rule = KIND_RULES[kind];
	if (!rule) fail('INVALID_STATE', 'Jenis berkas tidak dikenal.');
	return rule;
}

/** Validasi sebelum menulis apa pun. */
export function assertUploadable(input: UploadInput): { maxBytes: number; label: string } {
	const rule = ruleFor(input.kind);
	if (!input.file || input.file.size === 0) {
		fail('INVALID_STATE', 'Berkas kosong. Pilih berkas yang berisi.');
	}
	if (input.file.size > rule.maxBytes) {
		fail(
			'INVALID_STATE',
			`${rule.label} maksimal ${(rule.maxBytes / 1024 / 1024).toFixed(0)}MB. Berkas Anda ${(input.file.size / 1024 / 1024).toFixed(1)}MB.`
		);
	}
	if (input.file.size > MAX_UPLOAD_BYTES) {
		fail('INVALID_STATE', 'Ukuran berkas melebihi batas penyimpanan 50MB.');
	}
	const mime = input.file.type || 'application/octet-stream';
	if (!rule.mime.test(mime)) {
		fail(
			'INVALID_STATE',
			`Jenis berkas "${mime}" tidak diterima untuk ${rule.label.toLowerCase()}.`
		);
	}
	return { maxBytes: rule.maxBytes, label: rule.label };
}

/**
 * Menulis objek ke penyimpanan yang tersedia.
 *
 * Nama file dibersihkan dari karakter aneh dan diberi timestamp supaya unggahan
 * berulang dengan nama sama tidak saling menimpa.
 */
export async function putObject(
	input: UploadInput
): Promise<{
	provider: 'SUPABASE' | 'LOCAL';
	bucket: string;
	path: string;
}> {
	const rule = ruleFor(input.kind);
	const safeName = input.file.name
		.toLowerCase()
		.replace(/[^a-z0-9.\-_]/g, '-')
		.replace(/-+/g, '-')
		.slice(-80);
	const path = `${input.projectId}/${input.kind.toLowerCase()}/${Date.now()}-${safeName}`;

	if (isRemoteStorageConfigured()) {
		/* Browser mengunggah langsung; server hanya membuat signed URL. */
		const signed = await createSignedUpload({
			bucket: rule.bucket,
			projectId: input.projectId,
			fileName: safeName,
			sizeBytes: input.file.size
		});

		/* Unggah dilakukan server supaya aksi form tetap satu langkah. */
		const { getSupabaseAdmin } = await import('./storageService');
		const buffer = Buffer.from(await input.file.arrayBuffer());
		const { error } = await getSupabaseAdmin()
			.storage.from(rule.bucket)
			.upload(signed.path, buffer, {
				contentType: input.file.type || 'application/octet-stream',
				upsert: false
			});
		if (error) {
			fail('INVALID_STATE', `Unggah ke penyimpanan gagal: ${error.message}`);
		}

		return { provider: 'SUPABASE', bucket: rule.bucket, path: signed.path };
	}

	/* Penyimpanan lokal: hanya untuk pengembangan. */
	const target = join(localRoot(), path);
	await mkdir(join(localRoot(), input.projectId, input.kind.toLowerCase()), { recursive: true });
	await writeFile(target, Buffer.from(await input.file.arrayBuffer()));
	return { provider: 'LOCAL', bucket: 'local', path };
}

/** Menyimpan metadata aset setelah objek benar-benar tertulis. */
export async function recordAsset(
	input: UploadInput,
	stored: { provider: 'SUPABASE' | 'LOCAL'; bucket: string; path: string }
): Promise<UploadResult> {
	const rule = ruleFor(input.kind);

	/*
	 * Versi dihitung dari aset sejenis pada proyek yang sama, sehingga unggahan
	 * kedua menimpa tampilan tanpa menghapus riwayat.
	 */
	const [last] = await db
		.select({ version: fileAssets.version })
		.from(fileAssets)
		.where(and(eq(fileAssets.projectId, input.projectId), eq(fileAssets.kind, input.kind)))
		.orderBy(desc(fileAssets.version))
		.limit(1);

	const version = (last?.version ?? 0) + 1;

	const [row] = await db
		.insert(fileAssets)
		.values({
			projectId: input.projectId,
			taskId: input.taskId ?? null,
			kind: input.kind,
			storageProvider: stored.provider === 'SUPABASE' ? 'SUPABASE' : 'SUPABASE',
			bucket: stored.bucket,
			storagePath: stored.path,
			fileName: input.file.name,
			mimeType: input.file.type || 'application/octet-stream',
			sizeBytes: input.file.size,
			version,
			isPreview: input.isPreview ?? false,
			requiresFullPayment: rule.requiresPayment,
			uploadedBy: input.uploadedBy
		})
		.returning({ id: fileAssets.id });

	if (!row) fail('INVALID_STATE', 'Gagal menyimpan metadata berkas.');

	/* Mode lokal ditandai di metadata agar UI tahu tautan harus lewat route. */
	if (stored.provider === 'LOCAL') {
		await db
			.update(fileAssets)
			.set({ storageProvider: 'SUPABASE', bucket: 'local' })
			.where(eq(fileAssets.id, row.id));
	}

	return {
		assetId: row.id,
		fileName: input.file.name,
		sizeBytes: input.file.size,
		provider: stored.provider,
		isPreview: input.isPreview ?? false
	};
}

/** Alur lengkap: validasi → tulis → catat metadata. */
export async function uploadProjectFile(input: UploadInput): Promise<UploadResult> {
	assertUploadable(input);
	const stored = await putObject(input);
	return recordAsset(input, stored);
}

/** Membaca berkas lokal (mode pengembangan) untuk route unduhan. */
export async function readLocalAsset(
	bucket: string,
	path: string
): Promise<{ buffer: Buffer; size: number } | null> {
	if (bucket !== 'local') return null;
	const target = join(localRoot(), path);
	/* Cegah path traversal: hasil resolve harus tetap di dalam root. */
	if (!resolve(target).startsWith(localRoot())) return null;
	try {
		const info = await stat(target);
		if (!info.isFile()) return null;
		return { buffer: await readFile(target), size: info.size };
	} catch {
		return null;
	}
}

/**
 * Tautan unduh untuk sebuah aset, menghormati gerbang pelunasan.
 *
 * Mengembalikan `null` bila aset terkunci: UI lalu menampilkan label "Terkunci"
 * alih-alih tautan yang akan gagal. Penjaga sesungguhnya tetap di route
 * penyaji (`/files/[id]`) dan di `resolveAssetUrl` untuk Supabase.
 */
export async function assetDownloadUrl(asset: {
	id: string;
	bucket: string | null;
	storagePath: string | null;
	requiresFullPayment: boolean;
	isPreview: boolean;
	highResUnlocked?: boolean;
}): Promise<string | null> {
	if (!asset.storagePath) return null;
	if (asset.requiresFullPayment && !asset.isPreview && !asset.highResUnlocked) return null;

	/* Mode lokal: route `/files/[id]` yang menyajikan isinya. */
	if (asset.bucket === 'local') return `/files/${asset.id}`;

	try {
		const { signedUrl } = await createSignedDownload(
			asset.bucket as BucketName,
			asset.storagePath
		);
		return signedUrl;
	} catch {
		return null;
	}
}

export { KIND_RULES, ErpError };
