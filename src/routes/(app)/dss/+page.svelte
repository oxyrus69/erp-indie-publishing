<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatDate, formatIDR, formatDateTime } from '$lib/ui';
	import {
		AlertTriangle,
		ArrowRight,
		Ban,
		CheckCircle2,
		ChevronRight,
		CircleDollarSign,
		Gauge,
		RefreshCw,
		ScrollText
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	type Item = PageData['items'][number];

	const DOMAIN_LABEL: Record<string, string> = {
		title: 'Judul',
		cash: 'Kas',
		production: 'Produksi',
		price: 'Harga'
	};

	const DOMAIN_ICON: Record<string, typeof Gauge> = {
		title: RefreshCw,
		cash: CircleDollarSign,
		production: Gauge
	};

	const URGENCY = {
		3: { label: 'Segera', tone: 'danger' },
		2: { label: 'Minggu ini', tone: 'warn' },
		1: { label: 'Pantau', tone: 'neutral' }
	} as const satisfies Record<number, { label: string; tone: 'danger' | 'warn' | 'neutral' }>;

	/** Satu form keputusan dipakai ulang untuk semua kartu. */
	let dismissing = $state<string | null>(null);

	const acceptSubmit = forms.make({
		key: 'decision-accept',
		successTitle: 'Keputusan dicatat',
		errorTitle: 'Gagal mencatat keputusan'
	});

	const dismissSubmit = forms.make({
		key: 'decision-dismiss',
		successTitle: 'Penolakan dicatat',
		errorTitle: 'Gagal mencatat penolakan',
		onSuccess: () => (dismissing = null)
	});

	function factsJson(item: Item): string {
		return JSON.stringify(item.facts);
	}
</script>

<svelte:head><title>Keputusan · ERP Penerbitan</title></svelte:head>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Sistem Pendukung Keputusan</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Yang Perlu Diputuskan</h1>
			<p class="mt-1 max-w-[64ch] text-sm text-ink-500 dark:text-ink-400">
				Setiap baris menyebut fakta pemicunya, dampaknya, dan tindakan yang bisa langsung dibuka.
				Menolak juga keputusan: alasannya wajib, dan tercatat.
			</p>
		</div>
		<a href="/dss/simulasi" class="btn-secondary">
			Simulasi harga <ArrowRight class="size-4" />
		</a>
	</div>
</header>

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan keputusan"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Perlu Keputusan</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.summary.open}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.summary.open > 0 ? 'dari seluruh domain' : 'tidak ada yang mendesak'}
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Dampak Terbuka</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.summary.openImpact)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">rupiah yang menunggu</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Dikerjakan 7 Hari</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.summary.acceptedThisWeek}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.summary.dismissedThisWeek} ditolak
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Tingkat Dikerjakan</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">
			{data.summary.acceptRate === null ? '—' : `${data.summary.acceptRate}%`}
		</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">dari keputusan 7 hari terakhir</p>
	</article>
</section>

<!-- Filter domain: tautan biasa, supaya URL bisa dibagikan. -->
<nav class="mb-4 flex flex-wrap items-center gap-1.5" aria-label="Saring domain">
	<a
		href="/dss"
		aria-current={data.domain === '' ? 'true' : undefined}
		class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
			{data.domain === ''
			? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600'
			: 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300'}"
	>
		Semua
		<span class="ml-1 font-mono text-[10px] opacity-70">{data.totalItems}</span>
	</a>
	{#each Object.entries(data.countByDomain) as [key, count] (key)}
		<a
			href={`/dss?domain=${key}`}
			aria-current={data.domain === key ? 'true' : undefined}
			class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
				{data.domain === key
				? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600'
				: 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300'}"
		>
			{DOMAIN_LABEL[key]}
			<span class="ml-1 font-mono text-[10px] opacity-70">{count}</span>
		</a>
	{/each}
</nav>

{#if data.items.length === 0}
	<section class="card px-6 py-12 text-center">
		<CheckCircle2 class="mx-auto size-8 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
		<p class="mt-3 text-sm font-medium">Tidak ada yang perlu diputuskan</p>
		<p class="mx-auto mt-1 max-w-md text-xs text-ink-500 dark:text-ink-400">
			Semua rekomendasi pada ambang saat ini sudah diputuskan atau belum terpicu. Ambang bisa
			diubah di Pengaturan bila ingin lebih waspada.
		</p>
		<div class="mt-4 flex flex-wrap justify-center gap-2">
			<a href="/admin/pengaturan" class="btn-secondary">Ubah ambang</a>
			<a href="/dss/riwayat" class="btn-secondary">Lihat riwayat keputusan</a>
		</div>
	</section>
{:else}
	<ul class="space-y-3">
		{#each data.items as item (item.key)}
			{@const urgency = URGENCY[item.urgency] ?? URGENCY[1]}
			{@const Icon = DOMAIN_ICON[item.domain] ?? Gauge}
			<li class="card overflow-hidden">
				<div class="flex flex-wrap items-start gap-3 px-5 py-4">
					<span
						class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
						aria-hidden="true"
					>
						<Icon class="size-4" strokeWidth={1.75} />
					</span>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-sm font-semibold">{item.title}</h2>
							<StatusBadge label={urgency.label} tone={urgency.tone} dot={false} />
							<span class="text-[11px] uppercase tracking-wide text-ink-400">
								{DOMAIN_LABEL[item.domain] ?? item.domain}
							</span>
						</div>
						<p class="mt-1 max-w-[76ch] text-sm text-ink-700 dark:text-ink-300">{item.reason}</p>

						<dl class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
							<div class="flex items-baseline gap-1.5">
								<dt class="shrink-0 text-ink-400">Dampak</dt>
								<dd class="font-mono tabular-nums text-ink-700 dark:text-ink-200">
									{item.impact > 0 ? formatIDR(item.impact) : '—'}
								</dd>
							</div>
							<div class="flex items-baseline gap-1.5">
								<dt class="shrink-0 text-ink-400">Ukuran</dt>
								<dd class="text-ink-600 dark:text-ink-300">{item.impactLabel}</dd>
							</div>
						</dl>
					</div>
				</div>

				<div
					class="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-2.5 dark:border-ink-800 dark:bg-ink-950/30"
				>
					{#if item.action}
						<a href={item.action.href} class="btn-secondary !py-1.5 text-xs">
							{item.action.label} <ChevronRight class="size-3.5" />
						</a>
					{/if}

					<form
						method="POST"
						action="?/decide"
						use:enhance={acceptSubmit}
						data-action="decision-accept"
						class="contents"
					>
						<input type="hidden" name="key" value={item.key} />
						<input type="hidden" name="title" value={item.title} />
						<input type="hidden" name="domain" value={item.domain} />
						<input type="hidden" name="kind" value={item.kind} />
						<input type="hidden" name="reason" value={item.reason} />
						<input type="hidden" name="impact" value={item.impact} />
						<input type="hidden" name="entityType" value={item.entity.type} />
						<input type="hidden" name="entityId" value={item.entity.id ?? ''} />
						<input type="hidden" name="facts" value={factsJson(item)} />
						<input type="hidden" name="verdict" value="ACCEPTED" />
						<SubmitButton class="btn-primary !py-1.5 text-xs" busy={forms.isBusy('decision-accept')}>
							<CheckCircle2 class="size-3.5" /> Kerjakan
						</SubmitButton>
					</form>

					{#if dismissing === item.key}
						<form
							method="POST"
							action="?/decide"
							use:enhance={dismissSubmit}
							data-action="decision-dismiss"
							class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
						>
							<input type="hidden" name="key" value={item.key} />
							<input type="hidden" name="title" value={item.title} />
							<input type="hidden" name="domain" value={item.domain} />
							<input type="hidden" name="kind" value={item.kind} />
							<input type="hidden" name="reason" value={item.reason} />
							<input type="hidden" name="impact" value={item.impact} />
							<input type="hidden" name="entityType" value={item.entity.type} />
							<input type="hidden" name="entityId" value={item.entity.id ?? ''} />
							<input type="hidden" name="facts" value={factsJson(item)} />
							<input type="hidden" name="verdict" value="DISMISSED" />
							<label class="sr-only" for={`note-${item.key}`}>Alasan menolak</label>
							<input
								id={`note-${item.key}`}
								type="text"
								name="note"
								class="field !w-auto min-w-40 flex-1 !py-1.5 text-xs"
								placeholder="Alasan menolak, mis. pembeli sudah janji bayar Jumat"
								required
								minlength="5"
							/>
							<SubmitButton class="btn-secondary !py-1.5 text-xs" busy={forms.isBusy('decision-dismiss')}>
								Catat penolakan
							</SubmitButton>
							<button
								type="button"
								class="rounded-md px-2 py-1.5 text-xs text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
								onclick={() => (dismissing = null)}
							>
								Batal
							</button>
						</form>
					{:else}
						<button
							type="button"
							class="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-500 transition hover:bg-ink-100 hover:text-ink-700 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-200"
							onclick={() => (dismissing = item.key)}
						>
							<Ban class="size-3.5" /> Tidak sekarang
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if data.history.length > 0}
	<section class="card mt-6 overflow-hidden">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Keputusan Terakhir</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Beserta alasan penolakan — supaya bisa dinilai ulang, bukan hanya diingat.
				</p>
			</div>
			<ScrollText class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.history.slice(0, 8) as row (row.id)}
				<li class="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
					<div class="min-w-0">
						<p class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-medium">{row.title}</span>
							<StatusBadge
								label={row.verdict === 'ACCEPTED' ? 'Dikerjakan' : 'Ditolak'}
								tone={row.verdict === 'ACCEPTED' ? 'done' : 'neutral'}
								dot={false}
							/>
						</p>
						{#if row.note}
							<p class="mt-0.5 text-xs text-ink-600 dark:text-ink-300">“{row.note}”</p>
						{/if}
						<p class="mt-0.5 text-[11px] text-ink-400">
							{row.actorName ?? 'Sistem'} · {formatDateTime(row.createdAt)}
						</p>
					</div>
					<span class="shrink-0 font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
						{row.impactValue > 0 ? formatIDR(row.impactValue) : '—'}
					</span>
				</li>
			{/each}
		</ul>
		<div class="border-t border-ink-100 px-5 py-3 dark:border-ink-800">
			<a href="/dss/riwayat" class="link text-xs">Riwayat lengkap</a>
		</div>
	</section>
{/if}

{#if data.items.some((item: Item) => item.kind === 'deadline')}
	<p class="mt-4 flex items-start gap-1.5 text-xs text-ink-400">
		<AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
		Deadline yang sudah lewat dihitung dari tenggat task paling awal yang belum selesai.
	</p>
{/if}
