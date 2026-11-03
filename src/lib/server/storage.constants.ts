/**
 * Konstanta penyimpanan berkas.
 *
 * Dipisah dari `env.ts` karena file ini diimpor oleh modul yang dievaluasi
 * saat build (analisis route) — di titik itu variabel lingkungan belum tentu
 * tersedia, dan `env.ts` sengaja gagal keras bila kunci wajib kosong.
 */

export const STORAGE_BUCKETS = {
	manuscripts: 'manuscripts',
	layoutPdfs: 'layout-pdfs',
	legalIsbn: 'legal-isbn'
} as const;

export type BucketName = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/** Ukuran maksimum unggahan (Supabase Free Tier: 50MB per file). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
