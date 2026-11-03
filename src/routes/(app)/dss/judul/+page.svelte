<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import CurrencyInput from '$lib/components/CurrencyInput.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatIDR } from '$lib/ui';
	import { ArrowLeft, ArrowRight, PackageX, TrendingDown, TrendingUp } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	type Row = PageData['rows'][number];

	const DECISION = {
		reorder: { label: 'Cetak ulang', tone: 'danger' },
		dead_stock: { label: 'Modal tertahan', tone: 'warn' },
		thin_margin: { label: 'Margin tipis', tone: 'warn' },
		healthy: { label: 'Sehat', tone: 'done' },
		unknown: { label: 'Belum dinilai', tone: 'neutral' }
	} as const satisfies Record<string, { label: string; tone: 'danger' | 'warn' | 'done' | 'neutral' }>;

	let editing = $state<string | null>(null);

	const saveSubmit = forms.make({
		key: 'set-price',
		successTitle: 'Harga diperbarui',
		errorTitle: 'Harga gagal diubah',
		onSuccess: () => (editing = null)
	});
</script>

<svelte:head><title>Keputusan Judul · DSS · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/dss" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Keputusan
	</a>
	<span aria-hidden="true">/</span>
	<span>Judul</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">DSS · Judul</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Harga, Cetak Ulang, Hentikan</h1>
			<p class="mt-1 max-w-[64ch] text-sm text-ink-500 dark:text-ink-400">
				Margin dihitung dari HPP cetak yang benar-benar terjadi, bukan estimasi. Laju jual adalah
				eksemplar terjual dalam 30 hari terakhir.
			</p>
		</div>
		<a href="/dss/simulasi" class="btn-secondary">
			Simulasi harga <ArrowRight class="size-4" />
		</a>
	</div>
</header>

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan keputusan judul"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Perlu Cetak Ulang</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.counts.reorder}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			stok habis ≤ {data.rules.reorderCoverDays} hari
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Modal Tertahan</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.totalStockValue)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.counts.deadStock} judul lambat laku
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Margin Tipis</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.counts.thinMargin}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			di bawah {data.rules.minMarginPct}%
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Belum Dinilai</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.counts.unknown}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">belum punya HPP nyata</p>
	</article>
</section>

{#if data.rows.length === 0}
	<section class="card px-6 py-12 text-center">
		<PackageX class="mx-auto size-8 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		<p class="mt-3 text-sm font-medium">Belum ada judul yang bisa dinilai</p>
		<p class="mx-auto mt-1 max-w-md text-xs text-ink-500 dark:text-ink-400">
			Judul masuk ke sini setelah order cetak pertama diterima — saat itulah HPP per eksemplar
			menjadi nyata.
		</p>
	</section>
{:else}
	<section class="card overflow-hidden">
		<div class="hidden md:block">
			<table class="w-full text-sm">
				<caption class="sr-only">
					Keputusan per judul: margin, stok, laju jual, dan tindakan yang disarankan
				</caption>
				<thead>
					<tr class="border-b border-ink-100 dark:border-ink-800">
						<th scope="col" class="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Judul
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							HPP
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Harga
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Margin
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Stok
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Laku 30h
						</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Sisa
						</th>
						<th scope="col" class="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Keputusan
						</th>
						<th scope="col" class="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
							Harga baru
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.rows as row (row.projectId)}
						{@const decision = DECISION[row.decision] ?? DECISION.unknown}
						<tr class="hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
							<td class="px-5 py-3">
								<a
									href={`/projects/${row.projectId}`}
									class="text-sm font-medium text-yale-700 hover:underline dark:text-yale-300"
								>
									{row.title}
								</a>
								<p class="text-[11px] text-ink-500 dark:text-ink-400">{row.authorName}</p>
							</td>
							<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">
								{row.unitCost > 0 ? formatIDR(row.unitCost) : '—'}
							</td>
							<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">
								{row.retailPrice > 0 ? formatIDR(row.retailPrice) : '—'}
							</td>
							<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">
								{#if row.hasRealCost}
									<span class={row.marginPct < data.rules.minMarginPct ? 'text-orange-700 dark:text-orange-400' : ''}>
										{row.marginPct}%
									</span>
									<span class="block text-[10px] text-ink-400">{formatIDR(row.marginPerCopy)}</span>
								{:else}
									—
								{/if}
							</td>
							<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">{row.onHand}</td>
							<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">{row.sold30}</td>
							<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">
								{row.daysOfStock === null ? '—' : `${row.daysOfStock} h`}
							</td>
							<td class="px-3 py-3">
								<StatusBadge label={decision.label} tone={decision.tone} dot={false} />
							</td>
							<td class="px-5 py-3 text-right">
								{#if editing === row.projectId}
									<form method="POST" action="?/setPrice" use:enhance={saveSubmit} data-action="set-price" class="flex items-end justify-end gap-1.5">
										<input type="hidden" name="projectId" value={row.projectId} />
										<label class="sr-only" for={`price-${row.projectId}`}>Harga retail baru</label>
										<input
											id={`price-${row.projectId}`}
											type="text"
											inputmode="numeric"
											name="retailPrice"
											class="field !w-28 !py-1 text-right font-mono text-xs tabular-nums"
											value={row.retailPrice}
										/>
										<SubmitButton class="btn-primary !px-2 !py-1 text-xs" busy={forms.isBusy('set-price')}>
											Simpan
										</SubmitButton>
									</form>
								{:else}
									<button
										type="button"
										class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
										onclick={() => (editing = row.projectId)}
									>
										Ubah
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Ponsel: kartu per judul, angka penting saja. -->
		<ul class="divide-y divide-ink-100 md:hidden dark:divide-ink-800">
			{#each data.rows as row (row.projectId)}
				{@const decision = DECISION[row.decision]}
				<li class="px-4 py-4">
					<div class="flex items-start justify-between gap-2">
						<a
							href={`/projects/${row.projectId}`}
							class="text-sm font-medium text-yale-700 dark:text-yale-300"
						>
							{row.title}
						</a>
						<StatusBadge label={decision.label} tone={decision.tone} dot={false} />
					</div>
					<p class="text-[11px] text-ink-500 dark:text-ink-400">{row.authorName}</p>
					<dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
						<div>
							<dt class="text-[10px] uppercase tracking-[0.06em] text-ink-400">HPP / Harga</dt>
							<dd class="font-mono tabular-nums">
								{formatIDR(row.unitCost)} / {formatIDR(row.retailPrice)}
							</dd>
						</div>
						<div>
							<dt class="text-[10px] uppercase tracking-[0.06em] text-ink-400">Margin</dt>
							<dd class="font-mono tabular-nums">
								{row.hasRealCost ? `${row.marginPct}%` : '—'}
							</dd>
						</div>
						<div>
							<dt class="text-[10px] uppercase tracking-[0.06em] text-ink-400">Stok</dt>
							<dd class="font-mono tabular-nums">{row.onHand} eks</dd>
						</div>
						<div>
							<dt class="text-[10px] uppercase tracking-[0.06em] text-ink-400">Laku / sisa</dt>
							<dd class="font-mono tabular-nums">
								{row.sold30}/bln · {row.daysOfStock === null ? '—' : `${row.daysOfStock} h`}
							</dd>
						</div>
					</dl>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.counts.unknown > 0}
	<p class="mt-4 flex items-start gap-1.5 text-xs text-ink-400">
		<TrendingDown class="mt-0.5 size-3.5 shrink-0" />
		{data.counts.unknown} judul belum punya HPP nyata karena belum pernah dicetak. Bukan disembunyikan —
		supaya jelas mana yang datanya belum ada, bukan mana yang aman.
	</p>
{/if}
{#if data.counts.reorder > 0}
	<p class="mt-2 flex items-start gap-1.5 text-xs text-ink-400">
		<TrendingUp class="mt-0.5 size-3.5 shrink-0" />
		Cetak ulang diurutkan dari modal tertahan terbesar: judul yang paling banyak uangnya di gudang
		dan paling cepat habis.
	</p>
{/if}
