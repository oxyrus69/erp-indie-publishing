<script lang="ts">
	import { page } from '$app/state';
	import { formatIDR } from '$lib/ui';
	import { ArrowLeft, Download, TrendingUp } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const totalPipeline = $derived(
		data.funnel.reduce((sum: number, row: (typeof data.funnel)[number]) => sum + row.value, 0)
	);
	const totalWeighted = $derived(
		data.funnel.reduce((sum: number, row: (typeof data.funnel)[number]) => sum + row.weighted, 0)
	);
	const maxFunnel = $derived(
		Math.max(
			1,
			...data.funnel.map((row: (typeof data.funnel)[number]) => row.value)
		)
	);
	const maxMonthly = $derived(
		Math.max(1, ...data.monthly.map((row: (typeof data.monthly)[number]) => row.count))
	);

	const exportHref = $derived(`/crm/export${page.url.search}`);
</script>

<svelte:head><title>Laporan CRM · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/crm" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Prospek
	</a>
	<span aria-hidden="true">/</span>
	<span>Laporan</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">CRM</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Laporan Pipeline</h1>
			<p class="mt-1 max-w-[62ch] text-sm text-ink-500 dark:text-ink-400">
				Angka dihitung dari baris prospek saat halaman dibuka. Filter yang aktif di papan ikut
				terbawa ke ekspor CSV.
			</p>
		</div>
		<a href={exportHref} class="btn-secondary" download>
			<Download class="size-4" /> Unduh CSV
		</a>
	</div>
</header>

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan laporan"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Nilai Pipeline</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(totalPipeline)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.funnel.reduce((sum: number, row: (typeof data.funnel)[number]) => sum + row.count, 0)} prospek aktif
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Nilai Terbobot</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(totalWeighted)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">menurut peluang tahap</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Win Rate</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">
			{data.winRate === null ? '—' : `${data.winRate}%`}
		</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.wonTotal} menang dari {data.closedTotal} prospek selesai
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Sumber Terbaik</p>
		<p class="mt-2 truncate text-lg">
			{data.bestSource && data.bestSource.win > 0
				? data.sourceLabel[data.bestSource.source]
				: 'belum ada'}
		</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.bestSource && data.bestSource.win > 0
				? `${data.bestSource.win} menang · ${formatIDR(data.bestSource.value)}`
				: 'belum ada prospek menang'}
		</p>
	</article>
</section>

<div class="grid gap-6 lg:grid-cols-2">
	<!-- Funnel -->
	<section class="card" aria-labelledby="judul-funnel">
		<div class="card-header">
			<div>
				<h2 id="judul-funnel" class="text-sm font-semibold">Funnel per Tahap</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Nilai dan jumlah prospek yang masih berjalan.
				</p>
			</div>
			<TrendingUp class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<table class="w-full text-sm">
			<caption class="sr-only">Funnel pipeline per tahap beserta nilai dan nilai terbobot</caption>
			<thead>
				<tr class="border-b border-ink-100 dark:border-ink-800">
					<th scope="col" class="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
						Tahap
					</th>
					<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
						Jumlah
					</th>
					<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
						Nilai
					</th>
					<th scope="col" class="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
						Terbobot
					</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.funnel as row (row.stage)}
					<tr>
						<td class="px-5 py-3">
							<p class="text-sm font-medium">{data.stageLabel[row.stage]}</p>
							<div class="mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
								<div
									class="h-full rounded-full bg-yale-700 dark:bg-yale-400"
									style="width: {Math.round((row.value / maxFunnel) * 100)}%"
								></div>
							</div>
						</td>
						<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">{row.count}</td>
						<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">
							{row.value > 0 ? formatIDR(row.value) : '—'}
						</td>
						<td class="px-5 py-3 text-right font-mono text-sm tabular-nums text-ink-500 dark:text-ink-400">
							{row.weighted > 0 ? formatIDR(row.weighted) : '—'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<!-- Sumber -->
	<section class="card" aria-labelledby="judul-sumber">
		<div class="card-header">
			<div>
				<h2 id="judul-sumber" class="text-sm font-semibold">Per Sumber</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Dari mana prospek datang, dan mana yang berujung menang.
				</p>
			</div>
		</div>
		{#if data.sources.length > 0}
			<table class="w-full text-sm">
				<caption class="sr-only">Jumlah prospek, jumlah menang, dan nilai menang per sumber</caption>
				<thead>
					<tr class="border-b border-ink-100 dark:border-ink-800">
						<th scope="col" class="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Sumber
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Masuk
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Menang
						</th>
						<th scope="col" class="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Nilai Menang
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.sources as row (row.source)}
						<tr>
							<td class="px-5 py-3 text-sm">{data.sourceLabel[row.source] ?? row.source}</td>
							<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">{row.count}</td>
							<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">{row.win}</td>
							<td class="px-5 py-3 text-right font-mono text-sm tabular-nums">
								{row.value > 0 ? formatIDR(row.value) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
				Belum ada prospek tercatat.
			</p>
		{/if}
	</section>

	<!-- Prospek masuk per bulan -->
	<section class="card" aria-labelledby="judul-bulanan">
		<div class="card-header">
			<div>
				<h2 id="judul-bulanan" class="text-sm font-semibold">Prospek Masuk per Bulan</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Dua belas bulan terakhir.</p>
			</div>
		</div>
		{#if data.monthly.length > 0}
			<ul class="space-y-2 px-5 py-4">
				{#each data.monthly as row (row.month)}
					<li class="flex items-center gap-3">
						<span class="w-16 shrink-0 font-mono text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
							{row.month}
						</span>
						<span class="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
							<span
								class="block h-full rounded-full bg-yale-700 dark:bg-yale-400"
								style="width: {Math.round((row.count / maxMonthly) * 100)}%"
							></span>
						</span>
						<span class="w-8 shrink-0 text-right font-mono text-xs tabular-nums">{row.count}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
				Belum ada prospek masuk pada rentang ini.
			</p>
		{/if}
	</section>

	<!-- Aktivitas per staf + outreach -->
	<section class="card" aria-labelledby="judul-staf">
		<div class="card-header">
			<div>
				<h2 id="judul-staf" class="text-sm font-semibold">Aktivitas 30 Hari</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Siapa yang benar-benar menghubungi prospek.
				</p>
			</div>
		</div>
		{#if data.staff.length > 0}
			<ul class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.staff as row (row.name)}
					<li class="flex items-center justify-between gap-3 px-5 py-2.5">
						<span class="truncate text-sm">{row.name}</span>
						<span class="font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
							{row.count} aktivitas
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-5 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
				Belum ada aktivitas dalam 30 hari terakhir.
			</p>
		{/if}

		{#if data.outreach.length > 0}
			<div class="border-t border-ink-100 px-5 py-4 dark:border-ink-800">
				<h3 class="label">Pesan Terkirim</h3>
				<ul class="mt-2 space-y-1.5">
					{#each data.outreach as row (row.channel)}
						<li class="flex items-center justify-between gap-3 text-sm">
							<span>{data.channelLabel[row.channel] ?? row.channel}</span>
							<span class="font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
								{row.sent} terkirim · {row.replied} dibalas
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>
</div>
