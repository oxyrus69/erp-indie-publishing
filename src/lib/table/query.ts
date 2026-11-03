/**
 * Bahasa query tabel yang dipakai bersama oleh halaman dan endpoint ekspor.
 *
 * Semua daftar besar (proyek, piutang) disortir, disaring, dan dipotong di
 * server. Klien hanya mengirim preferences lewat URL, jadi jumlah baris yang
 * dikirim tidak pernah tumbuh mengikuti ukuran database.
 *
 * Kontrak URL:
 *   ?sort=title:asc&status=IN_PRODUCTION&page=2&size=25&q=naskah
 *
 * Nilai yang tidak dikenal jatuh ke default yang aman — parameter dari URL
 * tidak pernah diteruskan mentah ke SQL.
 */

export type SortDir = 'asc' | 'desc';

export type TableQuery = {
	sort: string;
	dir: SortDir;
	page: number;
	size: number;
	q: string;
	/** Filter bebas per dimensi; kunci sudah divalidasi pemanggil. */
	filters: Record<string, string>;
	total: number;
	totalPages: number;
	from: number;
	to: number;
};

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type ParseTableArgs = {
	/** Kolom yang boleh dipakai untuk sorting; nama logis, bukan SQL. */
	sortable: readonly string[];
	defaultSort: string;
	defaultDir?: SortDir;
	/** Dimensi filter yang dikenali beserta nilai yang sah. */
	filterOptions?: Record<string, readonly string[]>;
	defaultSize?: number;
};

export function parseTableQuery(url: URL, args: ParseTableArgs): Omit<TableQuery, 'total' | 'totalPages' | 'from' | 'to'> {
	const params = url.searchParams;

	const rawSort = params.get('sort') ?? '';
	const sort = args.sortable.includes(rawSort) ? rawSort : args.defaultSort;

	const rawDir = params.get('dir');
	const dir: SortDir =
		rawDir === 'asc' || rawDir === 'desc' ? rawDir : (args.defaultDir ?? 'asc');

	const rawSize = Number.parseInt(params.get('size') ?? '', 10);
	const size =
		PAGE_SIZES.includes(rawSize as (typeof PAGE_SIZES)[number]) && rawSize <= MAX_PAGE_SIZE
			? rawSize
			: (args.defaultSize ?? DEFAULT_PAGE_SIZE);

	const rawPage = Number.parseInt(params.get('page') ?? '1', 10);
	const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

	const filters: Record<string, string> = {};
	for (const [key, allowed] of Object.entries(args.filterOptions ?? {})) {
		const value = params.get(key);
		if (value && allowed.includes(value)) filters[key] = value;
	}

	return {
		sort,
		dir,
		page,
		size,
		q: (params.get('q') ?? '').trim(),
		filters
	};
}

/** Melengkapi query dengan hasil hitung supaya footer bisa menyebut rentang pasti. */
export function finalizeTableQuery(
	query: Omit<TableQuery, 'total' | 'totalPages' | 'from' | 'to'>,
	total: number
): TableQuery {
	const totalPages = Math.max(1, Math.ceil(total / query.size));
	const page = Math.min(Math.max(1, query.page), totalPages);
	const from = total === 0 ? 0 : (page - 1) * query.size + 1;
	const to = Math.min(total, page * query.size);
	return { ...query, page, total, totalPages, from, to };
}

/** Membangun URL halaman dengan mempertahankan filter aktif. */
export function tableHref(
	basePath: string,
	query: Omit<TableQuery, 'total' | 'totalPages' | 'from' | 'to'>,
	override: Record<string, string | number | null> = {}
): string {
	const params = new URLSearchParams();
	params.set('sort', query.sort);
	params.set('dir', query.dir);
	if (query.q) params.set('q', query.q);
	params.set('size', String(query.size));
	if (query.page > 1) params.set('page', String(query.page));
	for (const [key, value] of Object.entries(query.filters)) params.set(key, value);

	for (const [key, value] of Object.entries(override)) {
		if (value === null || value === '') params.delete(key);
		else params.set(key, String(value));
	}

	const qs = params.toString();
	return qs ? `${basePath}?${qs}` : basePath;
}

/** Toggle arah bila kolom sama, mulai dari asc bila kolom berbeda. */
export function nextSort(query: { sort: string; dir: SortDir }, column: string): { sort: string; dir: SortDir } {
	if (query.sort !== column) return { sort: column, dir: 'asc' };
	return { sort: column, dir: query.dir === 'asc' ? 'desc' : 'asc' };
}
