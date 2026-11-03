/**
 * Filter periode untuk laporan.
 *
 * Satu tempat untuk menerjemahkan parameter URL menjadi rentang tanggal yang
 * aman, supaya keuangan, HPP, dan ekspor CSV tidak punya tafsir berbeda atas
 * URL yang sama.
 *
 * Kontrak URL:
 *   ?from=2026-01-01&to=2026-03-31   rentang bebas
 *   ?month=2026-09                   satu bulan penuh
 *   (kosong)                         semua waktu
 *
 * Tanggal yang tidak valid atau terbalik **diabaikan**, bukan error: laporan
 * yang tidak bisa dibuka karena URL salah ketik lebih buruk daripada laporan
 * yang jatuh ke "semua waktu" dengan label jelas.
 */

export type Period = {
	/** `YYYY-MM-DD` atau null bila tanpa batas. */
	from: string | null;
	to: string | null;
	/** Kunci bulan (`YYYY-MM`) bila mode bulan tunggal dipakai. */
	month: string | null;
	/** Label siap tampil, mis. "Sep 2026" atau "1 Jan – 31 Mar 2026". */
	label: string;
	/** true bila tidak ada batas tanggal sama sekali. */
	isAllTime: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;

const MONTHS_ID = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'Mei',
	'Jun',
	'Jul',
	'Agu',
	'Sep',
	'Okt',
	'Nov',
	'Des'
];

function isValidDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime());
}

function formatDateID(value: string): string {
	const [y, m, d] = value.split('-');
	const month = MONTHS_ID[Number.parseInt(m ?? '1', 10) - 1] ?? m;
	return `${Number.parseInt(d ?? '1', 10)} ${month} ${y}`;
}

/** Hari terakhir sebuah bulan, mis. `2026-02` → `2026-02-28`. */
function lastDayOfMonth(month: string): string {
	const [y, m] = month.split('-').map((part) => Number.parseInt(part, 10));
	const last = new Date(Date.UTC(y ?? 1970, (m ?? 1), 0));
	return last.toISOString().slice(0, 10);
}

export function parsePeriod(url: URL): Period {
	const rawMonth = url.searchParams.get('month') ?? '';
	const rawFrom = url.searchParams.get('from') ?? '';
	const rawTo = url.searchParams.get('to') ?? '';

	/* Satu bulan penuh mengalahkan rentang bebas agar URL tidak ambigu. */
	if (MONTH_KEY.test(rawMonth)) {
		const from = `${rawMonth}-01`;
		const to = lastDayOfMonth(rawMonth);
		if (isValidDate(from) && isValidDate(to)) {
			const [y, m] = rawMonth.split('-');
			return {
				from,
				to,
				month: rawMonth,
				label: `${MONTHS_ID[Number.parseInt(m ?? '1', 10) - 1] ?? m} ${y}`,
				isAllTime: false
			};
		}
	}

	const from = isValidDate(rawFrom) ? rawFrom : null;
	const to = isValidDate(rawTo) ? rawTo : null;

	/* Rentang terbalik: pakai yang lebih masuk akal (tukar) daripada menolak. */
	if (from && to && from > to) {
		return {
			from: to,
			to: from,
			month: null,
			label: `${formatDateID(to)} – ${formatDateID(from)}`,
			isAllTime: false
		};
	}

	if (from && to) {
		return {
			from,
			to,
			month: null,
			label: `${formatDateID(from)} – ${formatDateID(to)}`,
			isAllTime: false
		};
	}
	if (from) {
		return { from, to: null, month: null, label: `Sejak ${formatDateID(from)}`, isAllTime: false };
	}
	if (to) {
		return { from: null, to, month: null, label: `Sampai ${formatDateID(to)}`, isAllTime: false };
	}

	return { from: null, to: null, month: null, label: 'Semua waktu', isAllTime: true };
}

/** Parameter URL untuk sebuah periode, siap dipakai di tautan. */
export function periodParams(period: Period): Record<string, string> {
	const params: Record<string, string> = {};
	if (period.month) params.month = period.month;
	else {
		if (period.from) params.from = period.from;
		if (period.to) params.to = period.to;
	}
	return params;
}

/**
 * Pil periode cepat: bulan berjalan, 3 bulan, 12 bulan, semua.
 * Dihitung dari tanggal hari ini di server agar tidak bergantung jam klien.
 */
export function quickPeriods(): { key: string; label: string; params: Record<string, string> }[] {
	const now = new Date();
	const iso = (d: Date) => d.toISOString().slice(0, 10);
	const monthStart = (offset: number) =>
		iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)));
	const monthKey = (offset: number) => {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
		return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	};

	return [
		{ key: 'thisMonth', label: 'Bulan ini', params: { month: monthKey(0) } },
		{ key: 'last3', label: '3 bulan', params: { from: monthStart(2), to: iso(now) } },
		{ key: 'last12', label: '12 bulan', params: { from: monthStart(11), to: iso(now) } },
		{ key: 'all', label: 'Semua', params: {} }
	];
}
