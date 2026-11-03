<script lang="ts">
	import PrintDocument from '$lib/components/PrintDocument.svelte';
	import { formatIDR } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const meta = $derived([
		{
			label: 'Periode',
			value: data.selectedMonth
				? (data.availableMonths.find((m) => m.value === data.selectedMonth)?.label ??
					data.selectedMonth)
				: `${data.groups.length} bulan`
		},
		{ label: 'HPP cetak', value: formatIDR(data.grandTotals.printCost) },
		{ label: 'Royalti', value: formatIDR(data.grandTotals.royalty) }
	]);
</script>

<PrintDocument
	title="Laporan HPP per Judul"
	subtitle="Biaya cetak dan royalti penulis, dikelompokkan per judul per bulan."
	{meta}
	backHref="/admin/finance?tab=cash"
	backLabel="Kembali ke kas & HPP"
>
	<div class="no-print mb-5 flex flex-wrap items-center gap-2">
		<a
			href="/admin/finance/laporan"
			class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
				{data.selectedMonth
				? 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'
				: 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600'}"
		>
			Semua bulan
		</a>
		{#each data.availableMonths as month (month.value)}
			<a
				href="/admin/finance/laporan?bulan={month.value}"
				class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
					{data.selectedMonth === month.value
					? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600'
					: 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'}"
			>
				{month.label}
			</a>
		{/each}
	</div>

	{#each data.groups as group, index (group.key)}
		<section class={index > 0 ? 'page-break mt-8' : ''}>
			<h2 class="mb-2 font-serif text-lg">{group.label}</h2>

			<table class="doc-table">
				<caption class="sr-only">HPP per judul bulan {group.label}</caption>
				<thead>
					<tr>
						<th scope="col">Judul</th>
						<th scope="col" class="text-right!">Order cetak</th>
						<th scope="col" class="text-right!">Eksemplar</th>
						<th scope="col" class="text-right!">HPP cetak</th>
						<th scope="col" class="text-right!">Terjual</th>
						<th scope="col" class="text-right!">Royalti</th>
					</tr>
				</thead>
				<tbody>
					{#each group.lines as line (line.projectId)}
						<tr>
							<td>
								<p>{line.title}</p>
								<p class="text-[10px] text-ink-500 dark:text-ink-400">
									Stok gudang {line.onHand} eksemplar
								</p>
							</td>
							<td class="text-right tabular-nums">{line.runs || '—'}</td>
							<td class="text-right tabular-nums">{line.units || '—'}</td>
							<td class="text-right font-mono tabular-nums">
								{line.printCost > 0 ? formatIDR(line.printCost) : '—'}
							</td>
							<td class="text-right tabular-nums">{line.soldUnits || '—'}</td>
							<td class="text-right font-mono tabular-nums">
								{line.royalty > 0 ? formatIDR(line.royalty) : '—'}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="py-6 text-center text-ink-500">
								Tidak ada aktivitas pada bulan ini.
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr>
						<th scope="row" colspan="2" class="text-left">Total {group.label}</th>
						<td class="text-right tabular-nums">{group.totals.units}</td>
						<td class="text-right font-mono tabular-nums">{formatIDR(group.totals.printCost)}</td>
						<td class="text-right tabular-nums">{group.totals.soldUnits}</td>
						<td class="text-right font-mono font-semibold tabular-nums">
							{formatIDR(group.totals.royalty)}
						</td>
					</tr>
				</tfoot>
			</table>
		</section>
	{/each}

	{#if data.groups.length === 0}
		<p class="py-10 text-center text-sm text-ink-500">Belum ada data cetak atau penjualan.</p>
	{/if}
</PrintDocument>
