<script lang="ts">
	import { AreaChart } from 'layerchart';
	import { compactIDR, seriesSummary, tooltipIDR } from '$lib/charts/format';
	import { formatIDR } from '$lib/ui';

	/**
	 * Kas masuk per bulan.
	 *
	 * Satu deret, jadi sumbu-Y ringkas (jt/rb) dan tooltip menampilkan nominal
	 * penuh. Tabel data di bawah grafik bukan hiasan: SVG tidak terbaca oleh
	 * pembaca layar, dan angka pasti tetap dibutuhkan saat grafiknya dicetak
	 * hitam-putih.
	 */
	let {
		points,
		title = 'Kas Masuk per Bulan',
		hint = 'Pembayaran invoice yang sudah diverifikasi.'
	}: {
		points: { month: string; label: string; value: number }[];
		title?: string;
		hint?: string;
	} = $props();

	const total = $derived(points.reduce((acc, p) => acc + p.value, 0));
	const summary = $derived(seriesSummary(points, 'Kas masuk'));
	const hasData = $derived(points.some((p) => p.value > 0));
</script>

<figure class="m-0">
	<figcaption class="mb-3 flex flex-wrap items-start justify-between gap-2">
		<div>
			<h2 class="text-sm font-semibold">{title}</h2>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{hint}</p>
		</div>
		<p class="font-mono text-sm tabular-nums">{formatIDR(total)}</p>
	</figcaption>

	<p class="sr-only">{summary}</p>

	{#if hasData}
		<div class="w-full" aria-hidden="true">
			<AreaChart
				data={points}
				x="label"
				y="value"
				height={220}
				series={[{ key: 'Kas masuk', value: 'value' }]}
				padding={{ top: 10, right: 14, bottom: 4, left: 14 }}
				props={{
					yAxis: {
						format: (v: number) => compactIDR(v),
						tickSpacing: 46,
						tickLabelProps: { fill: 'var(--chart-tick)', fontSize: 10 }
					},
					xAxis: {
						tickSpacing: 70,
						tickLabelProps: { fill: 'var(--chart-tick)', fontSize: 10 }
					},
					grid: { y: { stroke: 'var(--chart-grid)', strokeWidth: 1 } },
					area: { fill: 'var(--chart-fill)' },
					spline: { stroke: 'var(--chart-line)', strokeWidth: 2 }
				}}
			/>
		</div>

		<!-- Angka pasti: terbaca mesin, tetap ada saat dicetak. -->
		<table class="mt-4 w-full border-collapse text-xs">
			<caption class="sr-only">{title}</caption>
			<thead>
				<tr class="border-b border-ink-200 text-left dark:border-ink-800">
					<th scope="col" class="py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
						Bulan
					</th>
					<th scope="col" class="py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
						Kas masuk
					</th>
				</tr>
			</thead>
			<tbody>
				{#each points.filter((p) => p.value > 0) as point (point.month)}
					<tr class="border-b border-ink-100 last:border-0 dark:border-ink-800">
						<td class="py-1.5 pr-3">{point.label}</td>
						<td class="py-1.5 text-right font-mono tabular-nums">
							{tooltipIDR(point.value)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<div
			class="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 text-center dark:border-ink-700"
		>
			<p class="text-sm font-medium">Belum ada penerimaan</p>
			<p class="mt-0.5 max-w-xs text-xs text-ink-500 dark:text-ink-400">
				Grafik terisi otomatis begitu tim keuangan memverifikasi pembayaran pertama.
			</p>
		</div>
	{/if}
</figure>
