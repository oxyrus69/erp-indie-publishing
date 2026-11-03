/** Label & warna status bersama untuk seluruh UI (Bahasa Indonesia). */

export type Tone = 'neutral' | 'progress' | 'review' | 'done' | 'warn' | 'danger';

export const TONE_CLASS: Record<Tone, string> = {
	neutral:
		'border-ink-200 bg-ink-50 text-ink-600 dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-300',
	progress:
		'border-yale-200 bg-yale-50 text-yale-700 dark:border-yale-900/60 dark:bg-yale-950/40 dark:text-yale-300',
	review:
		'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
	done: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
	warn: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300',
	danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
};

/** Warna titik status (dipakai bersama badge). */
export const TONE_DOT: Record<Tone, string> = {
	neutral: 'bg-ink-400',
	progress: 'bg-yale-600',
	review: 'bg-amber-500',
	done: 'bg-emerald-500',
	warn: 'bg-orange-500',
	danger: 'bg-red-500'
};

export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
	INITIATED: { label: 'Dimulai', tone: 'neutral' },
	IN_PRODUCTION: { label: 'Produksi', tone: 'progress' },
	AWAITING_AUTHOR: { label: 'Menunggu Penulis', tone: 'review' },
	READY_FOR_PRINT: { label: 'Siap Cetak', tone: 'warn' },
	IN_PRINTING: { label: 'Sedang Cetak', tone: 'progress' },
	PUBLISHED: { label: 'Terbit', tone: 'done' },
	COMPLETED: { label: 'Selesai', tone: 'done' },
	ON_HOLD: { label: 'Ditahan', tone: 'warn' },
	CANCELLED: { label: 'Dibatalkan', tone: 'danger' }
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
	DRAFT: { label: 'Draft', tone: 'neutral' },
	AWAITING_DOWN_PAYMENT: { label: 'Menunggu DP', tone: 'warn' },
	IN_PRODUCTION: { label: 'Produksi', tone: 'progress' },
	AWAITING_FINAL_SETTLEMENT: { label: 'Menunggu Pelunasan', tone: 'warn' },
	READY_FOR_RELEASE: { label: 'Siap Rilis', tone: 'done' },
	COMPLETED: { label: 'Selesai', tone: 'done' },
	CANCELLED: { label: 'Dibatalkan', tone: 'danger' }
};

export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
	PENDING: { label: 'Belum Mulai', tone: 'neutral' },
	IN_PROGRESS: { label: 'Dikerjakan', tone: 'progress' },
	WAITING_AUTHOR_REVIEW: { label: 'Menunggu Review', tone: 'review' },
	COMPLETED: { label: 'Disetujui', tone: 'done' },
	CANCELLED: { label: 'Dibatalkan', tone: 'danger' }
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
	DRAFT: { label: 'Draft', tone: 'neutral' },
	UNPAID: { label: 'Belum Bayar', tone: 'warn' },
	PAID: { label: 'Lunas', tone: 'done' },
	VOID: { label: 'Dibatalkan', tone: 'neutral' },
	OVERDUE: { label: 'Jatuh Tempo', tone: 'danger' }
};

export const INVOICE_KIND: Record<string, string> = {
	DOWN_PAYMENT: 'Uang Muka',
	FINAL_SETTLEMENT: 'Pelunasan',
	EXTRA_REVISION: 'Revisi Ekstra',
	ADDON_SERVICE: 'Layanan Tambahan',
	PRINT_ADDON: 'Cetak Tambahan'
};

export const EDITORIAL_STAGE: Record<string, { label: string; tone: Tone }> = {
	MANUSCRIPT_SUBMITTED: { label: 'Naskah Masuk', tone: 'neutral' },
	EDITING: { label: 'Penyuntingan', tone: 'progress' },
	PROOFREADING: { label: 'Proofreading', tone: 'progress' },
	LAYOUTING: { label: 'Tata Letak', tone: 'progress' },
	AUTHOR_REVIEW: { label: 'Review Penulis', tone: 'review' },
	LAYOUT_APPROVED: { label: 'Layout Disetujui', tone: 'done' }
};

export const COVER_STAGE: Record<string, { label: string; tone: Tone }> = {
	BRIEF_SUBMITTED: { label: 'Brief Masuk', tone: 'neutral' },
	DRAFTING_COVER: { label: 'Drafting', tone: 'progress' },
	AUTHOR_REVIEW: { label: 'Review Penulis', tone: 'review' },
	COVER_APPROVED: { label: 'Cover Disetujui', tone: 'done' }
};

export const LEGAL_STAGE: Record<string, { label: string; tone: Tone }> = {
	PENDING_FILES: { label: 'Menunggu Berkas', tone: 'neutral' },
	SUBMITTED_TO_PERPUSNAS: { label: 'Diajukan ke Perpusnas', tone: 'progress' },
	ISBN_ISSUED: { label: 'ISBN Terbit', tone: 'done' }
};

export const PRINT_STAGE: Record<string, { label: string; tone: Tone }> = {
	PRINT_QUEUE: { label: 'Antrean Cetak', tone: 'neutral' },
	PRINTING: { label: 'Proses Cetak', tone: 'progress' },
	QUALITY_CONTROL: { label: 'Quality Control', tone: 'review' },
	SHIPPED_TO_AUTHOR: { label: 'Dikirim ke Penulis', tone: 'warn' },
	ADDED_TO_WAREHOUSE: { label: 'Masuk Gudang', tone: 'done' }
};

export const PAPER_LABEL: Record<string, string> = {
	BOOKPAPER: 'Bookpaper',
	HVS: 'HVS',
	ART_PAPER: 'Art Paper'
};

export const BINDING_LABEL: Record<string, string> = {
	PERFECT_BINDING: 'Perfect Binding',
	SPIRAL: 'Spiral',
	HARDCOVER: 'Hardcover',
	STAPLE: 'Staples'
};

export const LAMINATION_LABEL: Record<string, string> = {
	NONE: 'Tanpa Laminasi',
	DOFF: 'Doff',
	GLOSSY: 'Glossy'
};

export const ROLE_LABEL_ID: Record<string, string> = {
	SUPER_ADMIN: 'Super Admin',
	PROJECT_MANAGER: 'Project Manager',
	FINANCE: 'Finance',
	FREELANCER: 'Freelancer',
	AUTHOR: 'Penulis'
};

export const SPECIALTY_LABEL: Record<string, string> = {
	EDITOR: 'Editor',
	PROOFREADER: 'Proofreader',
	LAYOUTER: 'Layouter',
	COVER_DESIGNER: 'Desainer Cover'
};

export const TRACK_LABEL: Record<string, string> = {
	EDITORIAL: 'Editorial',
	LAYOUT: 'Tata Letak',
	COVER: 'Cover',
	LEGAL: 'Legal & ISBN',
	PRINT: 'Cetak'
};

export function statusOf(
	map: Record<string, { label: string; tone: Tone }>,
	key: string | null | undefined
): { label: string; tone: Tone } {
	if (!key) return { label: '—', tone: 'neutral' };
	return map[key] ?? { label: key, tone: 'neutral' };
}

/** Format rupiah untuk komponen UI (aman dijalankan di browser). */
export function formatIDR(value: string | number | null | undefined): string {
	const n = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0
	}).format(Number.isFinite(n) ? n : 0);
}

export function formatDate(value: string | Date | null | undefined): string {
	if (!value) return '—';
	const d = typeof value === 'string' ? new Date(value) : value;
	return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
	if (!value) return '—';
	const d = typeof value === 'string' ? new Date(value) : value;
	return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
