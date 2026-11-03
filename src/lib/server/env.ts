import { env } from '$env/dynamic/private';
import {
	MAX_UPLOAD_BYTES,
	STORAGE_BUCKETS,
	type BucketName
} from './storage.constants';

/**
 * Centralised, validated environment access.
 *
 * Catatan penting: `required()` dijalankan saat modul dievaluasi, sehingga
 * file ini TIDAK boleh diimpor oleh modul yang ikut dievaluasi saat build
 * (analisis route) bila kuncinya bisa kosong. Konstanta penyimpanan karena
 * itu tinggal di `storage.constants.ts`.
 */
function required(name: string): string {
	const value = env[name];
	if (!value) {
		throw new Error(`[env] Variabel lingkungan "${name}" belum diset. Periksa file .env Anda.`);
	}
	return value;
}

export const DATABASE_URL = required('DATABASE_URL');

export const SUPABASE_URL = required('PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = required('PUBLIC_SUPABASE_ANON_KEY');

/** CLOUDINARY_URL format: cloudinary://<api_key>:<api_secret>@<cloud_name> */
export const CLOUDINARY_URL = required('CLOUDINARY_URL');

export { MAX_UPLOAD_BYTES, STORAGE_BUCKETS };
export type { BucketName };
