import { error } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '$db';
import { bookProjects, bookSales, inventory, printRuns } from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import type { PageServerLoad } from './$types';

const FINANCE_ROLES = ['SUPER_ADMIN', 'FINANCE'] as const;

const MONTHS_ID = [
	'Januari',
	'Februari',
	'Maret',
	'April',
	'Mei',
	'Juni',
	'Juli',
	'Agustus',
	'September',
	'Oktober',
	'November',
	'Desember'
];

/** `2026-10` → `Oktober 2026`. */
function monthLabel(key: string): string {
	const [year, month] = key.split('-');
	const index = Number.parseInt(month ?? '1', 10) - 1;
	const name = MONTHS_ID[index] ?? month;
	return `${name} ${year}`;
}

/**
 * Laporan HPP per judul per bulan.
 *
 * Dua angka yang dibutuhkan penerbitan dan tidak terlihat di halaman lain:
 *
 *  - **HPP tercatat** — biaya cetak yang benar-benar dikeluarkan pada bulan itu
 *    (dari `print_runs`, berdasarkan tanggal order cetak).
 *  - **Royalti terutang** — bagian penulis dari penjualan bulan itu
 *    (dari `book_sales.net_royalty`).
 *
 * Keduanya dikelompokkan per judul, lalu dijumlahkan per bulan, sehingga bisa
 * dipakai untuk menutup buku bulanan tanpa ekspor manual.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number])) {
		error(403, 'Hanya tim keuangan yang dapat membuka laporan HPP.');
	}

	const requested = url.searchParams.get('bulan');
	const monthPattern = /^\d{4}-\d{2}$/;

	/** HPP cetak dikelompokkan per judul + bulan. */
	const printRows = await db
		.select({
			month: sql<string>`to_char(${printRuns.createdAt}, 'YYYY-MM')`,
			projectId: bookProjects.id,
			title: bookProjects.title,
			runs: sql<number>`count(*)::int`,
			units: sql<number>`sum(${printRuns.quantity})::int`,
			totalCost: sql<string>`sum(${printRuns.totalCost})`
		})
		.from(printRuns)
		.innerJoin(bookProjects, eq(bookProjects.id, printRuns.projectId))
		.groupBy(
			sql`to_char(${printRuns.createdAt}, 'YYYY-MM')`,
			bookProjects.id,
			bookProjects.title
		)
		.orderBy(desc(sql`to_char(${printRuns.createdAt}, 'YYYY-MM')`), bookProjects.title);

	/** Royalti penulis dari penjualan, per judul + bulan. */
	const salesRows = await db
		.select({
			month: sql<string>`to_char(${bookSales.soldAt}, 'YYYY-MM')`,
			projectId: bookProjects.id,
			title: bookProjects.title,
			units: sql<number>`sum(${bookSales.quantity})::int`,
			gross: sql<string>`sum(${bookSales.grossAmount})`,
			royalty: sql<string>`sum(${bookSales.netRoyalty})`
		})
		.from(bookSales)
		.innerJoin(bookProjects, eq(bookProjects.id, bookSales.projectId))
		.groupBy(sql`to_char(${bookSales.soldAt}, 'YYYY-MM')`, bookProjects.id, bookProjects.title)
		.orderBy(desc(sql`to_char(${bookSales.soldAt}, 'YYYY-MM')`), bookProjects.title);

	/** Stok terkini untuk konteks: judul mana yang masih punya persediaan. */
	const stockRows = await db
		.select({
			projectId: inventory.projectId,
			onHand: inventory.onHand,
			soldTotal: inventory.soldTotal,
			avgCost: inventory.avgProductionCost
		})
		.from(inventory);
	const stockByProject = new Map(stockRows.map((row) => [row.projectId, row]));

	type Line = {
		projectId: string;
		title: string;
		runs: number;
		units: number;
		printCost: number;
		royalty: number;
		gross: number;
		soldUnits: number;
		onHand: number;
	};

	/** Gabungkan dua sumber menjadi satu baris per judul per bulan. */
	const months = new Map<string, Map<string, Line>>();

	function lineFor(month: string, projectId: string, title: string): Line {
		let bucket = months.get(month);
		if (!bucket) {
			bucket = new Map();
			months.set(month, bucket);
		}
		let line = bucket.get(projectId);
		if (!line) {
			const stock = stockByProject.get(projectId);
			line = {
				projectId,
				title,
				runs: 0,
				units: 0,
				printCost: 0,
				royalty: 0,
				gross: 0,
				soldUnits: 0,
				onHand: stock?.onHand ?? 0
			};
			bucket.set(projectId, line);
		}
		return line;
	}

	for (const row of printRows) {
		const line = lineFor(row.month, row.projectId, row.title);
		line.runs += row.runs;
		line.units += row.units;
		line.printCost += toNumber(row.totalCost);
	}

	for (const row of salesRows) {
		const line = lineFor(row.month, row.projectId, row.title);
		line.soldUnits += row.units;
		line.gross += toNumber(row.gross);
		line.royalty += toNumber(row.royalty);
	}

	const monthKeys = [...months.keys()].sort((a, b) => b.localeCompare(a));

	const build = (keys: string[]) =>
		keys.map((key) => {
			const lines = [...(months.get(key)?.values() ?? [])].sort((a, b) =>
				a.title.localeCompare(b.title)
			);
			return {
				key,
				label: monthLabel(key),
				lines,
				totals: {
					printCost: lines.reduce((acc, line) => acc + line.printCost, 0),
					royalty: lines.reduce((acc, line) => acc + line.royalty, 0),
					gross: lines.reduce((acc, line) => acc + line.gross, 0),
					units: lines.reduce((acc, line) => acc + line.units, 0),
					soldUnits: lines.reduce((acc, line) => acc + line.soldUnits, 0)
				}
			};
		});

	const selectedMonth = requested && monthPattern.test(requested) ? requested : null;
	const groups = build(selectedMonth ? monthKeys.filter((key) => key === selectedMonth) : monthKeys);

	return {
		groups,
		monthKeys,
		selectedMonth,
		availableMonths: monthKeys.map((key) => ({ value: key, label: monthLabel(key) })),
		grandTotals: {
			printCost: groups.reduce((acc, group) => acc + group.totals.printCost, 0),
			royalty: groups.reduce((acc, group) => acc + group.totals.royalty, 0),
			gross: groups.reduce((acc, group) => acc + group.totals.gross, 0)
		}
	};
};
