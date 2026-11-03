import { sql } from 'drizzle-orm';
import { db } from '$db';
import { toNumber } from '$lib/server/services/money';

/**
 * Agregat analitik untuk grafik.
 *
 * Semua perhitungan dilakukan di database lalu dikembalikan sebagai deret
 * siap-gambar. Alasannya bukan gaya: menarik seluruh invoice ke Node lalu
 * mengelompokkan per bulan akan melambat seiring data tumbuh, sementara
 * `date_trunc` + `group by` memakai indeks dan mengembalikan puluhan baris.
 *
 * Deret sengaja **padat** (bulan kosong diisi nol) karena grafik garis dengan
 * lubang menyesatkan: terlihat seperti data hilang, bukan seperti nol.
 */

export type MonthPoint = { month: string; label: string; value: number };

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

/** `2026-10` → `Okt 2026`. */
export function monthLabel(key: string): string {
	const [year, month] = key.split('-');
	const name = MONTHS_ID[Number.parseInt(month ?? '1', 10) - 1] ?? month;
	return `${name} ${year}`;
}

/**
 * Membangun deret bulan terakhir yang selalu padat.
 * @param rows hasil query `{ month, value }`
 * @param months jumlah bulan yang ditampilkan (termasuk bulan berjalan)
 */
function densify(
	rows: { month: string; value: string | number }[],
	months: number
): MonthPoint[] {
	const byMonth = new Map(rows.map((row) => [row.month, toNumber(row.value)]));

	const out: MonthPoint[] = [];
	const now = new Date();
	for (let offset = months - 1; offset >= 0; offset--) {
		const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		out.push({ month: key, label: monthLabel(key), value: byMonth.get(key) ?? 0 });
	}
	return out;
}

/** Kas masuk per bulan: jumlah pembayaran invoice yang diverifikasi. */
export async function cashInByMonth(months = 12): Promise<MonthPoint[]> {
	const rows = await db.execute<{ month: string; value: string }>(sql`
		select to_char(date_trunc('month', ${sql.identifier('paid_at')}), 'YYYY-MM') as month,
		       sum(${sql.identifier('amount')})::text as value
		from public.invoice_payments
		where ${sql.identifier('paid_at')} >= date_trunc('month', current_date) - interval '${sql.raw(String(months - 1))} months'
		group by 1
	`);
	return densify([...rows], months);
}

/**
 * Piutang menua (aging).
 *
 * Dasar hitungnya **tanggal jatuh tempo**, bukan tanggal invoice: tagihan yang
 * jatuh tempo bulan lalu dan belum dibayar adalah piutang 31–60 hari, bukan
 * piutang baru. Bila `due_date` kosong, dipakai tanggal invoice sebagai
 * perkiraan yang paling tidak menyesatkan.
 */
export type AgingBucket = { key: string; label: string; value: number; count: number };

export async function receivableAging(): Promise<AgingBucket[]> {
	const rows = await db.execute<{ bucket: string; value: string; count: string }>(sql`
		select
			case
				when age_days <= 30 then 'b0_30'
				when age_days <= 60 then 'b31_60'
				when age_days <= 90 then 'b61_90'
				else 'b90_plus'
			end as bucket,
			sum(outstanding)::text as value,
			count(*)::text as count
		from (
			select
				greatest(amount - paid_amount, 0) as outstanding,
				current_date - coalesce(due_date, created_at::date) as age_days
			from public.invoices
			where status not in ('VOID', 'PAID')
		) t
		group by 1
	`);

	const byKey = new Map([...rows].map((r) => [r.bucket, r]));
	const bucket = (key: string, label: string): AgingBucket => {
		const row = byKey.get(key);
		return {
			key,
			label,
			value: toNumber(row?.value ?? 0),
			count: Number(row?.count ?? 0)
		};
	};

	return [
		bucket('b0_30', '0–30 hari'),
		bucket('b31_60', '31–60 hari'),
		bucket('b61_90', '61–90 hari'),
		bucket('b90_plus', '> 90 hari')
	];
}

/**
 * Funnel kontrak: DP → Pelunasan → Cetak → Terbit.
 *
 * Dihitung per **order**, bukan per invoice, karena satu order bisa punya
 * beberapa invoice add-on. Urutannya mengikuti kenyataan produksi: order yang
 * sudah bayar pelunasan tapi belum cetak adalah pekerjaan yang menumpuk di
 * track cetak, bukan kegagalan penagihan.
 */
export type FunnelStep = { key: string; label: string; value: number; hint: string };

export async function contractFunnel(): Promise<{ total: number; steps: FunnelStep[] }> {
	const [row] = await db.execute<{
		orders_total: string;
		has_dp: string;
		has_final: string;
		printed: string;
		published: string;
	}>(sql`
		select
			count(*)::text as orders_total,
			count(*) filter (where exists (
				select 1 from public.invoices i
				where i.order_id = o.id and i.kind = 'DOWN_PAYMENT' and i.status = 'PAID'
			))::text as has_dp,
			count(*) filter (where exists (
				select 1 from public.invoices i
				where i.order_id = o.id and i.kind = 'FINAL_SETTLEMENT' and i.status = 'PAID'
			))::text as has_final,
			count(*) filter (where exists (
				select 1 from public.book_projects p
				join public.print_runs r on r.project_id = p.id
				where p.order_id = o.id
			))::text as printed,
			count(*) filter (where exists (
				select 1 from public.book_projects p
				where p.order_id = o.id and p.status in ('PUBLISHED', 'COMPLETED')
			))::text as published
		from public.orders o
		where o.status <> 'CANCELLED'
	`);

	const totalOrders = Number(row?.orders_total ?? 0);

	return {
		total: totalOrders,
		steps: [
			{
				key: 'dp',
				label: 'DP lunas',
				value: Number(row?.has_dp ?? 0),
				hint: 'Produksi boleh mulai'
			},
			{
				key: 'final',
				label: 'Pelunasan',
				value: Number(row?.has_final ?? 0),
				hint: 'File master terbuka'
			},
			{
				key: 'printed',
				label: 'Sudah cetak',
				value: Number(row?.printed ?? 0),
				hint: 'Ada order cetak'
			},
			{
				key: 'published',
				label: 'Terbit',
				value: Number(row?.published ?? 0),
				hint: 'Masuk katalog'
			}
		]
	};
}

/**
 * HPP vs harga jual per judul.
 *
 * HPP diambil dari `inventory.avg_production_cost` (rata-rata biaya cetak yang
 * benar-benar terjadi), bukan dari estimasi. Margin dihitung per eksemplar;
 * judul yang belum pernah dicetak tidak dimasukkan karena HPP-nya belum nyata.
 */
export type TitleMargin = {
	projectId: string;
	title: string;
	cost: number;
	price: number;
	margin: number;
	marginPct: number;
};

export async function titleMargins(limit = 8): Promise<TitleMargin[]> {
	const rows = await db.execute<{
		project_id: string;
		title: string;
		cost: string;
		price: string;
	}>(sql`
		select p.id as project_id, p.title,
		       i.avg_production_cost::text as cost,
		       i.retail_price::text as price
		from public.inventory i
		join public.book_projects p on p.id = i.project_id
		where i.avg_production_cost > 0 and i.retail_price > 0
		order by (i.retail_price - i.avg_production_cost) / nullif(i.retail_price, 0) desc
		limit ${limit}
	`);

	return [...rows].map((row) => {
		const cost = toNumber(row.cost);
		const price = toNumber(row.price);
		return {
			projectId: row.project_id,
			title: row.title,
			cost,
			price,
			margin: price - cost,
			marginPct: price > 0 ? Math.round(((price - cost) / price) * 100) : 0
		};
	});
}

/** Semua deret dasbor dalam satu panggilan paralel. */
export async function loadAnalytics(months = 12) {
	const [cashIn, aging, funnel, margins] = await Promise.all([
		cashInByMonth(months),
		receivableAging(),
		contractFunnel(),
		titleMargins()
	]);
	return { cashIn, aging, funnel, margins };
}