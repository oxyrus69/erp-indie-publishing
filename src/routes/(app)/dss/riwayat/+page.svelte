<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { formatDateTime, formatIDR } from '$lib/ui';
	import { ArrowLeft, ScrollText } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = PageData['history'][number];

	const DOMAIN_LABEL: Record<string, string> = {
		title: 'Judul',
		cash: 'Kas',
		production: 'Produksi',
		price: 'Harga'
	};

	let filter = $state<'all' | 'ACCEPTED' | 'DISMISSED'>('all');

	const rows = $derived(
		filter === 'all' ? data.history : data.history.filter((row: Row) => row.verdict === filter)
	);
</script>

<svelte:head><title>Riwayat Keputusan · DSS · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/dss" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Keputusan
	</a>
	<span aria-hidden="true">/</span>
	<span>Riwayat</span>
</nav>

<header class="mb-6">
	<div>
		<p class="label">DSS · Jejak</p>
		<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Riwayat Keputusan</h1>
		<p class="mt-1 max-w-[64ch] text-sm text-ink-500 dark:text-ink-400">
			Setiap baris menyimpan alasan penolakan dan angka yang dipakai saat memutuskan. Tanpa itu,
			keputusan hanya bisa dikenang, tidak bisa dinilai.
		</p>
	</div>
</header>

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan riwayat"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Total Keputusan</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.totals.all}</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Dikerjakan</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.totals.accepted}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{formatIDR(data.totals.acceptedImpact)} dampak tercatat
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Ditolak</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.totals.dismissed}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">dengan alasan tersimpan</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Rasio Dikerjakan</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">
			{data.totals.all > 0 ? `${Math.round((data.totals.accepted / data.totals.all) * 100)}%` : '—'}
		</p>
	</article>
</section>

<nav class="mb-4 flex flex-wrap items-center gap-1.5" aria-label="Saring riwayat">
	{#each [{ key: 'all', label: 'Semua' }, { key: 'ACCEPTED', label: 'Dikerjakan' }, { key: 'DISMISSED', label: 'Ditolak' }] as item (item.key)}
		<button
			type="button"
			aria-pressed={filter === item.key}
			onclick={() => (filter = item.key as 'all' | 'ACCEPTED' | 'DISMISSED')}
			class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
				{filter === item.key
				? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600'
				: 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300'}"
		>
			{item.label}
		</button>
	{/each}
</nav>

{#if rows.length === 0}
	<section class="card px-6 py-12 text-center">
		<ScrollText class="mx-auto size-8 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		<p class="mt-3 text-sm font-medium">Belum ada keputusan tercatat</p>
		<p class="mx-auto mt-1 max-w-md text-xs text-ink-500 dark:text-ink-400">
			Buka <a href="/dss" class="link">pusat keputusan</a> dan tandai satu rekomendasi sebagai
			dikerjakan atau tidak sekarang.
		</p>
	</section>
{:else}
	<section class="card overflow-hidden">
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each rows as row (row.id)}
				<li class="px-5 py-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="flex flex-wrap items-center gap-2 text-sm">
								<span class="font-medium">{row.title}</span>
								<StatusBadge
									label={row.verdict === 'ACCEPTED' ? 'Dikerjakan' : 'Ditolak'}
									tone={row.verdict === 'ACCEPTED' ? 'done' : 'neutral'}
									dot={false}
								/>
								<span class="text-[11px] uppercase tracking-wide text-ink-400">
									{DOMAIN_LABEL[row.domain] ?? row.domain}
								</span>
							</p>
							<p class="mt-0.5 max-w-[76ch] text-xs text-ink-600 dark:text-ink-300">{row.summary}</p>
							{#if row.note}
								<p class="mt-1 text-xs text-ink-700 dark:text-ink-200">
									Alasan: “{row.note}”
								</p>
							{/if}
							<p class="mt-0.5 text-[11px] text-ink-400">
								{row.actorName ?? 'Sistem'} · {formatDateTime(row.createdAt)}
							</p>
						</div>
						<span class="shrink-0 font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
							{row.impactValue > 0 ? formatIDR(row.impactValue) : '—'}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
