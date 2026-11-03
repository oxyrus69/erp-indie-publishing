<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { formatDate, formatIDR } from '$lib/ui';
	import {
		AlertTriangle,
		ArrowLeft,
		ArrowRight,
		CircleDollarSign,
		Download,
		Hourglass
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type QueueRow = PageData['queue'][number];

	const maxWeek = $derived(Math.max(1, ...data.weeks.map((week) => week.value)));
</script>

<svelte:head><title>Keputusan Kas · DSS · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/dss" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Keputusan
	</a>
	<span aria-hidden="true">/</span>
	<span>Kas</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">DSS · Kas</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Tagih Siapa Dulu</h1>
			<p class="mt-1 max-w-[64ch] text-sm text-ink-500 dark:text-ink-400">
				Antrean diurutkan umur lalu nilai. Proyeksi kas memakai tingkat koleksi historis pada umur
				yang sama, bukan asumsi semua tagihan akan dibayar.
			</p>
		</div>
		<a href="/admin/finance?tab=receivables&bucket=overdue" class="btn-secondary">
			Piutang lengkap <ArrowRight class="size-4" />
		</a>
	</div>
</header>

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan kas"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Piutang Terbuka</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.totals.outstanding)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.queue.length} invoice belum lunas
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Realistis Masuk</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.totals.weighted)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">setelah ditimbang riwayat koleksi</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Lewat Tenggat</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.totals.overdueAmount)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.totals.overdueCount} invoice
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Eksposur</p>
		<p class="mt-2 text-lg font-medium">
			{data.totals.holdSuggested ? 'Tahan produksi baru' : 'Masih aman'}
		</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			ambang {formatIDR(data.rules.holdProductionThreshold)}
		</p>
	</article>
</section>

{#if data.totals.holdSuggested}
	<p
		class="mb-6 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300"
	>
		<AlertTriangle class="mt-0.5 size-4 shrink-0" />
		Piutang terbuka melewati ambang. Menambah produksi baru sebelum menagih berarti menambah beban
		kas, bukan menambah pendapatan.
	</p>
{/if}

<div class="grid gap-6 lg:grid-cols-3">
	<!-- Antrean penagihan -->
	<section class="card overflow-hidden lg:col-span-2" aria-labelledby="judul-antrean">
		<div class="card-header">
			<div>
				<h2 id="judul-antrean" class="text-sm font-semibold">Antrean Penagihan</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Paling lama lewat tenggat lebih dulu; nilai besar mengalahkan nilai kecil pada umur yang
					sama.
				</p>
			</div>
			<CircleDollarSign class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		{#if data.queue.length === 0}
			<div class="px-5 py-12 text-center">
				<p class="text-sm font-medium">Tidak ada piutang terbuka</p>
				<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
					Semua invoice sudah lunas atau dibatalkan.
				</p>
			</div>
		{:else}
			<div class="hidden md:block">
				<table class="w-full text-sm">
					<caption class="sr-only">Antrean penagihan: invoice, umur, sisa, dan riwayat penulis</caption>
					<thead>
						<tr class="border-b border-ink-100 dark:border-ink-800">
							<th scope="col" class="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Invoice</th>
							<th scope="col" class="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Penulis</th>
							<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Jatuh tempo</th>
							<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Umur</th>
							<th scope="col" class="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Sisa</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
						{#each data.queue as row (row.invoiceId)}
							<tr class="hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
								<td class="px-5 py-3">
									<p class="font-mono text-xs">{row.invoiceNumber}</p>
									<p class="text-[11px] text-ink-400">{row.orderNumber}</p>
								</td>
								<td class="px-3 py-3">
									<p class="text-xs">{row.authorName}</p>
									{#if row.lateHistory > 1}
										<p class="text-[10px] text-orange-700 dark:text-orange-400">
											{row.lateHistory}× pernah lewat tenggat
										</p>
									{/if}
								</td>
								<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">
									{row.dueDate ? formatDate(row.dueDate) : '—'}
								</td>
								<td class="px-3 py-3 text-right">
									<span
										class="font-mono text-xs tabular-nums {row.overdueDays > 0
											? 'text-orange-700 dark:text-orange-400'
											: 'text-ink-500 dark:text-ink-400'}"
									>
										{row.overdueDays > 0 ? `+${row.overdueDays} h` : `${row.overdueDays} h`}
									</span>
								</td>
								<td class="px-5 py-3 text-right font-mono text-xs tabular-nums">
									{formatIDR(row.outstanding)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<ul class="divide-y divide-ink-100 md:hidden dark:divide-ink-800">
				{#each data.queue as row (row.invoiceId)}
					<li class="px-4 py-3">
						<div class="flex items-baseline justify-between gap-2">
							<span class="font-mono text-xs">{row.invoiceNumber}</span>
							<span class="font-mono text-sm tabular-nums">{formatIDR(row.outstanding)}</span>
						</div>
						<p class="mt-0.5 text-xs text-ink-600 dark:text-ink-300">{row.authorName}</p>
						<p class="mt-0.5 text-[11px] text-ink-400">
							{row.dueDate ? `jatuh tempo ${formatDate(row.dueDate)}` : 'tanpa jatuh tempo'}
							· {row.overdueDays > 0 ? `lewat ${row.overdueDays} hari` : `sisa ${Math.abs(row.overdueDays)} hari`}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Proyeksi + konsentrasi -->
	<div class="space-y-6">
		<section class="card" aria-labelledby="judul-proyeksi">
			<div class="card-header">
				<div>
					<h2 id="judul-proyeksi" class="text-sm font-semibold">Proyeksi Kas 8 Minggu</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Setelah ditimbang riwayat koleksi.</p>
				</div>
				<Hourglass class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>
			<ul class="space-y-2 px-5 py-4">
				{#each data.weeks as week (week.week)}
					<li class="flex items-center gap-3">
						<span class="w-12 shrink-0 font-mono text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
							{week.label}
						</span>
						<span class="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
							<span
								class="block h-full rounded-full bg-yale-700 dark:bg-yale-400"
								style="width: {Math.round((week.value / maxWeek) * 100)}%"
							></span>
						</span>
						<span class="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums">
							{week.value > 0 ? formatIDR(week.value) : '—'}
						</span>
					</li>
				{/each}
			</ul>
			<p class="border-t border-ink-100 px-5 py-3 text-[11px] text-ink-500 dark:text-ink-400 dark:border-ink-800">
				Invoice yang sudah lewat tempo dianggap masuk minggu ini. Yang belum jatuh tempo masuk minggu
				sesuai tanggalnya.
			</p>
		</section>

		<section class="card" aria-labelledby="judul-konsentrasi">
			<div class="card-header">
				<div>
					<h2 id="judul-konsentrasi" class="text-sm font-semibold">Konsentrasi Piutang</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Penulis yang menahan &gt; {data.rules.concentrationPct}% piutang.
					</p>
				</div>
			</div>
			{#if data.concentration.length === 0}
				<p class="px-5 py-8 text-center text-xs text-ink-500 dark:text-ink-400">
					Piutang tersebar merata. Tidak ada satu penulis yang menahan arus kas.
				</p>
			{:else}
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.concentration as row (row.authorId)}
						<li class="flex items-center justify-between gap-3 px-5 py-3">
							<div class="min-w-0">
								<p class="truncate text-xs font-medium">{row.authorName}</p>
								<p class="text-[11px] text-ink-400">{row.sharePct}% dari total piutang</p>
							</div>
							<span class="shrink-0 font-mono text-xs tabular-nums">
								{formatIDR(row.outstanding)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>

{#if data.recommendations.length > 0}
	<section class="mt-6" aria-labelledby="judul-rekomendasi">
		<h2 id="judul-rekomendasi" class="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-500 dark:text-ink-400">
			Sudah masuk pusat keputusan · {data.recommendations.length}
		</h2>
		<ul class="space-y-2">
			{#each data.recommendations as rec (rec.key)}
				<li class="card flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
					<div class="min-w-0">
						<p class="text-sm font-medium">{rec.title}</p>
						<p class="text-xs text-ink-500 dark:text-ink-400">{rec.reason}</p>
					</div>
					<span class="font-mono text-xs tabular-nums">{formatIDR(rec.impact)}</span>
				</li>
			{/each}
		</ul>
		<a href="/dss" class="link mt-2 inline-flex items-center gap-1 text-xs">
			Buka pusat keputusan <ArrowRight class="size-3" />
		</a>
	</section>
{/if}
