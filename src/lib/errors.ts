/**
 * Salinan halaman galat bersama (Bahasa Indonesia).
 *
 * Dipakai oleh `+error.svelte` di root maupun di dalam shell aplikasi, supaya
 * 403, 404, dan galat tak terduga tidak pernah tampil sebagai teks polos atau
 * halaman bawaan SvelteKit.
 */

/** Rute beranda tiap role; aman dijalankan di browser. */
export const ROLE_HOME_ID: Record<string, string> = {
	SUPER_ADMIN: '/admin',
	PROJECT_MANAGER: '/admin',
	FINANCE: '/admin',
	FREELANCER: '/freelancer',
	AUTHOR: '/portal'
};

/** Pesan bawaan SvelteKit yang tidak layak ditampilkan ke pengguna. */
const GENERIC_MESSAGES = new Set(['Not Found', 'Forbidden', 'Unauthorized', 'Internal Error', 'Error']);

const TITLE: Record<number, string> = {
	400: 'Permintaan tidak valid',
	401: 'Perlu masuk terlebih dahulu',
	403: 'Akses terbatas',
	404: 'Halaman tidak ditemukan',
	405: 'Metode tidak diizinkan',
	500: 'Ada gangguan di server'
};

const UNEXPECTED =
	'Permintaan Anda gagal diproses. Coba muat ulang sebentar lagi — bila tetap gagal, hubungi admin.';

const FALLBACK: Record<number, string> = {
	400: 'Alamat yang Anda buka tidak bisa dibaca sistem. Periksa kembali tautannya.',
	401: 'Sesi Anda sudah berakhir. Silakan masuk lagi untuk melanjutkan.',
	403: 'Peran akun Anda tidak memiliki izin untuk membuka halaman ini.',
	404: 'Tautan ini mungkin sudah dipindahkan, atau alamatnya salah ketik.',
	405: 'Aksi ini tidak tersedia pada halaman tersebut.',
	500: UNEXPECTED
};

export type ErrorCopy = {
	status: number;
	title: string;
	message: string;
	/** true bila pesan berasal dari server (bukan teks cadangan). */
	specific: boolean;
};

/**
 * Menyusun judul + penjelasan untuk sebuah galat.
 * Pesan spesifik dari server (mis. "Portal ini khusus untuk penulis.")
 * diutamakan; pesan bawaan SvelteKit seperti "Not Found" diganti salinan kita.
 */
export function errorCopy(status: number, message?: string | null): ErrorCopy {
	const clean = (message ?? '').trim();
	const specific = clean.length > 0 && !GENERIC_MESSAGES.has(clean);
	return {
		status,
		title: TITLE[status] ?? 'Terjadi kesalahan',
		message: specific ? clean : (FALLBACK[status] ?? UNEXPECTED),
		specific
	};
}

/** Saran tindakan berikutnya, bergantung pada status dan peran pengguna. */
export function errorHints(status: number, role: string | null): string[] {
	if (status === 403 && role) {
		if (role === 'AUTHOR') {
			return ['Halaman ini bagian dari ruang kerja tim internal.', 'Sebagai penulis Anda bisa memantau buku di Portal Penulis.'];
		}
		if (role === 'FREELANCER') {
			return ['Halaman ini bagian dari ruang kerja tim internal.', 'Tugas dan honor Anda tersedia di Ruang Freelancer.'];
		}
		return ['Akun Anda masuk dengan peran yang tidak mencakup halaman ini.'];
	}
	if (status === 404) {
		return ['Periksa kembali alamatnya, atau kembali ke ruang kerja Anda.'];
	}
	if (status >= 500) {
		return ['Tidak ada data yang hilang — aksi terakhir Anda mungkin belum tersimpan.'];
	}
	return [];
}
