import { eq } from 'drizzle-orm';
import { db } from '$db';
import { appSettings } from '$db/schema';

/**
 * Pengaturan aplikasi yang bisa diubah dari UI.
 *
 * Nilai default didefinisikan di sini (bukan hanya di migrasi) supaya:
 *  - baris yang belum ada tetap menghasilkan tarif yang benar,
 *  - kode yang memanggil `getPrintSettings()` tidak perlu menangani `undefined`.
 *
 * Pembacaan di-cache per proses dengan TTL pendek. Tarif cetak dibaca pada
 * setiap pembuatan order cetak dan setiap pratinjau HPP di halaman proyek;
 * query kecil pun tidak perlu diulang puluhan kali per request.
 */

export type PrintSettings = {
	paperRatePerPage: Record<'BOOKPAPER' | 'HVS' | 'ART_PAPER', number>;
	sizeMultiplier: Record<'A5' | 'B5' | 'UNESCO' | 'A4' | 'CUSTOM', number>;
	bindingCost: Record<'PERFECT_BINDING' | 'SPIRAL' | 'HARDCOVER' | 'STAPLE', number>;
	laminationCost: Record<'NONE' | 'DOFF' | 'GLOSSY', number>;
	fullColorMultiplier: number;
	minPages: number;
	vatPct: number;
};

export type DocumentSettings = {
	invoicePrefix: string;
	orderPrefix: string;
	withdrawalPrefix: string;
	salesPrefix: string;
};

export type WithdrawalSettings = {
	minimumAmount: number;
};

export const DEFAULT_PRINT: PrintSettings = {
	paperRatePerPage: { BOOKPAPER: 180, HVS: 220, ART_PAPER: 420 },
	sizeMultiplier: { A5: 1, B5: 1.25, UNESCO: 1.1, A4: 1.7, CUSTOM: 1 },
	bindingCost: { PERFECT_BINDING: 4500, SPIRAL: 6000, HARDCOVER: 18000, STAPLE: 2500 },
	laminationCost: { NONE: 0, DOFF: 1500, GLOSSY: 1500 },
	fullColorMultiplier: 2.4,
	minPages: 48,
	vatPct: 0
};

export const DEFAULT_DOCUMENT: DocumentSettings = {
	invoicePrefix: 'INV',
	orderPrefix: 'ORD',
	withdrawalPrefix: 'WDR',
	salesPrefix: 'SLS'
};

export const DEFAULT_WITHDRAWAL: WithdrawalSettings = {
	minimumAmount: 50000
};

const CACHE_TTL_MS = 10_000;

type CacheEntry = { value: unknown; at: number };
const cache = new Map<string, CacheEntry>();

/** Membersihkan cache — dipanggil setelah pengaturan disimpan. */
export function invalidateSettings(key?: string): void {
	if (key) cache.delete(key);
	else cache.clear();
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

	const [row] = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, key))
		.limit(1);

	/*
	 * Deep merge dengan default: pengaturan lama yang belum memuat field baru
	 * tetap lengkap, jadi penambahan field tidak menghasilkan `undefined` di
	 * tengah perhitungan HPP.
	 */
	const merged = mergeDeep(fallback, (row?.value ?? {}) as Record<string, unknown>) as T;
	cache.set(key, { value: merged, at: Date.now() });
	return merged;
}

function mergeDeep<T>(base: T, override: Record<string, unknown>): T {
	if (typeof base !== 'object' || base === null || Array.isArray(base)) {
		return (override as unknown as T) ?? base;
	}
	const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
	for (const [key, value] of Object.entries(override)) {
		const current = out[key];
		out[key] =
			typeof value === 'object' && value !== null && !Array.isArray(value) && current
				? mergeDeep(current, value as Record<string, unknown>)
				: value;
	}
	return out as T;
}

export const getPrintSettings = () => readSetting('print', DEFAULT_PRINT);
export const getDocumentSettings = () => readSetting('document', DEFAULT_DOCUMENT);
export const getWithdrawalSettings = () => readSetting('withdrawal', DEFAULT_WITHDRAWAL);

/* -------------------------------------------------------------------------- */
/*                                  VALIDASI                                  */
/* -------------------------------------------------------------------------- */

export type FieldError = { field: string; message: string };

/** Angka wajib: >= 0, berhingga. Mengembalikan error atau nilai. */
function num(
	value: unknown,
	field: string,
	label: string,
	opts: { min?: number; max?: number; integer?: boolean } = {}
): { error?: FieldError; value: number } {
	const raw = String(value ?? '').trim();
	/*
	 * Koma desimal diterima karena input angka di browser dengan locale
	 * Indonesia menampilkan `1,25`. `parseFloat('1,25')` menghasilkan `1`
	 * tanpa error — bug senyap yang membuat pengali berubah separuh.
	 *
	 * Titik juga diterima (locale Inggris), tetapi bila ada koma, koma yang
	 * dianggap pemisah desimal dan titik dibuang sebagai pemisah ribuan.
	 */
	const normalized = raw.includes(',')
		? raw.replace(/\./g, '').replace(',', '.')
		: raw;

	const n = typeof value === 'number' ? value : Number.parseFloat(normalized);
	if (!Number.isFinite(n)) {
		return { error: { field, message: `${label} harus berupa angka.` }, value: 0 };
	}
	if (opts.integer && !Number.isInteger(n)) {
		return { error: { field, message: `${label} harus bilangan bulat.` }, value: n };
	}
	if (opts.min !== undefined && n < opts.min) {
		return { error: { field, message: `${label} minimal ${opts.min}.` }, value: n };
	}
	if (opts.max !== undefined && n > opts.max) {
		return { error: { field, message: `${label} maksimal ${opts.max}.` }, value: n };
	}
	return { value: n };
}

/**
 * Membaca form pengaturan cetak.
 *
 * Mengembalikan `errors` per field agar UI bisa menandai input yang salah,
 * bukan hanya satu pesan di atas form. Semua field tetap divalidasi meski ada
 * yang gagal, supaya pengguna melihat seluruh masalahnya sekaligus.
 */
export function parsePrintSettings(form: FormData): {
	value: PrintSettings;
	errors: FieldError[];
} {
	const errors: FieldError[] = [];
	const pick = (name: string, label: string, opts = {}) => {
		const { error, value } = num(form.get(name), name, label, opts);
		if (error) errors.push(error);
		return value;
	};

	const value: PrintSettings = {
		paperRatePerPage: {
			BOOKPAPER: pick('paperBookpaper', 'Tarif bookpaper', { min: 0 }),
			HVS: pick('paperHvs', 'Tarif HVS', { min: 0 }),
			ART_PAPER: pick('paperArtPaper', 'Tarif art paper', { min: 0 })
		},
		sizeMultiplier: {
			A5: pick('sizeA5', 'Pengali A5', { min: 0.1 }),
			B5: pick('sizeB5', 'Pengali B5', { min: 0.1 }),
			UNESCO: pick('sizeUnesco', 'Pengali UNESCO', { min: 0.1 }),
			A4: pick('sizeA4', 'Pengali A4', { min: 0.1 }),
			CUSTOM: pick('sizeCustom', 'Pengali kustom', { min: 0.1 })
		},
		bindingCost: {
			PERFECT_BINDING: pick('bindPerfect', 'Biaya perfect binding', { min: 0 }),
			SPIRAL: pick('bindSpiral', 'Biaya spiral', { min: 0 }),
			HARDCOVER: pick('bindHardcover', 'Biaya hardcover', { min: 0 }),
			STAPLE: pick('bindStaple', 'Biaya staples', { min: 0 })
		},
		laminationCost: {
			NONE: pick('lamNone', 'Biaya tanpa laminasi', { min: 0 }),
			DOFF: pick('lamDoff', 'Biaya laminasi doff', { min: 0 }),
			GLOSSY: pick('lamGlossy', 'Biaya laminasi glossy', { min: 0 })
		},
		fullColorMultiplier: pick('fullColorMultiplier', 'Pengali full color', { min: 1 }),
		minPages: pick('minPages', 'Minimum halaman', { min: 1, integer: true }),
		vatPct: pick('vatPct', 'PPN', { min: 0, max: 100 })
	};

	return { value, errors };
}

export function parseDocumentSettings(form: FormData): {
	value: DocumentSettings;
	errors: FieldError[];
} {
	const errors: FieldError[] = [];
	const prefix = (name: string, label: string) => {
		const raw = String(form.get(name) ?? '').trim();
		/*
		 * Huruf kecil dibiarkan gagal, bukan diam-diam di-uppercase: prefix
		 * adalah bagian nomor dokumen resmi, dan pengguna perlu tahu bentuk
		 * yang benar sebelum dokumen pertama terbit.
		 */
		if (!/^[A-Z]{2,6}$/.test(raw)) {
			errors.push({
				field: name,
				message: `${label} harus 2–6 huruf kapital, tanpa spasi atau angka.`
			});
			return raw.slice(0, 6) || 'XX';
		}
		return raw;
	};

	const value: DocumentSettings = {
		invoicePrefix: prefix('invoicePrefix', 'Prefix invoice'),
		orderPrefix: prefix('orderPrefix', 'Prefix order'),
		withdrawalPrefix: prefix('withdrawalPrefix', 'Prefix penarikan'),
		salesPrefix: prefix('salesPrefix', 'Prefix penjualan')
	};

	return { value, errors };
}

export function parseWithdrawalSettings(form: FormData): {
	value: WithdrawalSettings;
	errors: FieldError[];
} {
	const errors: FieldError[] = [];
	const { error, value } = num(
		String(form.get('minimumAmount') ?? '').replace(/[^\d]/g, ''),
		'minimumAmount',
		'Minimum penarikan',
		{ min: 0, integer: true }
	);
	if (error) errors.push(error);
	return { value: { minimumAmount: value }, errors };
}
