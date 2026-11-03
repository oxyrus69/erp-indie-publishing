<script lang="ts">
	import { BarChart } from 'layerchart';
	import { compactIDR } from '$lib/charts/format';
	import { formatIDR } from '$lib/ui';
	import type { TitleMargin } from '$lib/server/services/analytics';

	/**
	 * HPP vs harga jual per judul.
	 *
	 * Dua batang berdampingan untuk setiap judul, bukan batang bertumpuk:
	 * tumpukan menyiratkan "biaya + margin = harga" yang memang benar, tetapi
	 * panjang batang kedua jadi berubah mengikuti HPP sehingga tinggi harga
	 * jual antar judul tidak bisa dibandingkan langsung. Berdampingan membuat
	 * jarak HPP→harga terbaca apa adanya, yaitu margin.
	 *
	 * Tabel di bawah memuat angka persisnya — HPP adalah angka yang dipakai
	 * untuk menetapkan harga, jadi harus bisa dibaca tanpa menebak dari grafik.
	 */
	let { titles }: { titles: TitleMargin[] } = $props();

	/**
	 * Label sumbu dipendekkan, tetapi harus tetap unik — dua judul yang
	 * dipotong jadi teks sama akan digabung d3 sebagai satu band dan batangnya
	 * hilang. Karena itu ekornya diberi pembeda pendek, bukan sekadar `…`.
	 */
	const chartData = $derived(
		titles.map((t, index) => ({
			label: t.title.length > 18 ? `${t.title.slice(0, 16)}…${index + 1}` : t.title,
			cost: t.cost,
			price: t.price
		}))
	);
</script>

<figure class="m-0">
	<figcaption class="mb-3">
		<h2 class="text-sm font-semibold">HPP vs Harga Jual</h2>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Per eksemplar, dari biaya cetak nyata dan harga retail tercatat.
		</p>
	</figcaption>

	{#if titles.length === 0}
		<div
			class="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 text-center dark:border-ink-700"
		>
			<p class="text-sm font-medium">Belum ada judul dengan HPP &amp; harga</p>
			<p class="mt-0.5 max-w-xs text-xs text-ink-500 dark:text-ink-400">
				Angka muncul setelah order cetak pertama dibuat dan harga retail diisi.
			</p>
		</div>
	{:else}
		<div class="w-full" aria-hidden="true">
			<BarChart
				data={chartData}
				x="label"
				series={[
					{
						key: 'HPP',
						value: 'cost',
						color: 'var(--chart-line)',
						props: { fill: 'var(--chart-line)' }
					},
					{
						key: 'Harga jual',
						value: 'price',
						color: 'var(--chart-line-soft)',
						props: { fill: 'var(--chart-line-soft)' }
					}
				]}
				seriesLayout="group"
				height={220}
				props={{
					yAxis: {
						format: (v: number) => compactIDR(v),
						tickSpacing: 46,
						tickLabelProps: { fill: 'var(--chart-tick)', fontSize: 10 }
					},
					xAxis: { tickLabelProps: { fill: 'var(--chart-tick)', fontSize: 10 } },
					grid: { y: { stroke: 'var(--chart-grid)', strokeWidth: 1 } }
				}}
			/>
		</div>

		<ul class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-500">
			<li class="flex items-center gap-1.5">
				<span
					class="size-2 rounded-sm"
					style="background-color: var(--chart-line)"
					aria-hidden="true"
				></span>
				HPP per eksemplar
			</li>
			<li class="flex items-center gap-1.5">
				<span
					class="size-2 rounded-sm"
					style="background-color: var(--chart-line-soft)"
					aria-hidden="true"
				></span>
				Harga jual retail
			</li>
		</ul>

		<table class="mt-4 w-full border-collapse text-xs">
			<caption class="sr-only">HPP dan harga jual per judul beserta margin</caption>
			<thead>
				<tr class="border-b border-ink-200 text-left dark:border-ink-800">
					<th scope="col" class="py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
						Judul
					</th>
					<th scope="col" class="py-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
						HPP
					</th>
					<th scope="col" class="py-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
						Harga
					</th>
					<th scope="col" class="py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
						Margin
					</th>
				</tr>
			</thead>
			<tbody>
				{#each titles as title (title.projectId)}
					<tr class="border-b border-ink-100 last:border-0 dark:border-ink-800">
						<td class="py-1.5 pr-3">
							<a
								href="/projects/{title.projectId}"
								class="rounded-sm text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
							>
								{title.title}
							</a>
						</td>
						<td class="py-1.5 pr-3 text-right font-mono tabular-nums">
							{formatIDR(title.cost)}
						</td>
						<td class="py-1.5 pr-3 text-right font-mono tabular-nums">
							{formatIDR(title.price)}
						</td>
						<td
							class="py-1.5 text-right font-mono tabular-nums {title.marginPct >= 40
								? 'text-emerald-700 dark:text-emerald-400'
								: title.marginPct >= 20
									? 'text-ink-700 dark:text-ink-200'
									: 'text-amber-700 dark:text-amber-400'}"
						>
							{title.marginPct}%
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</figure>
