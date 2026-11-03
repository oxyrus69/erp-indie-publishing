<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { formatDate, formatIDR } from '$lib/ui';
	import { AlertTriangle, ArrowLeft, ArrowRight, Clock, Users } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Keputusan Produksi · DSS · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/dss" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Keputusan
	</a>
	<span aria-hidden="true">/</span>
	<span>Produksi</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">DSS · Produksi</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Bottleneck &amp; Risiko Telat</h1>
			<p class="mt-1 max-w-[64ch] text-sm text-ink-500 dark:text-ink-400">
				Umur task tertua per track menunjukkan di mana pekerjaan benar-benar nyangkut. Rata-rata
				menyembunyikan satu task yang menahan semuanya.
			</p>
		</div>
		<a href="/projects" class="btn-secondary">
			Semua proyek <ArrowRight class="size-4" />
		</a>
	</div>
</header>

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan produksi"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Task Terbuka</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.totals.open}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">di seluruh track</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Menunggu Penulis</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.totals.review}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">review yang menahan track</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Kelebihan Beban</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.totals.overloaded}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			di atas {data.rules.maxOpenTasks} task terbuka
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Proyek Lewat Tenggat</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.totals.lateProjects}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">task paling awal sudah lewat</p>
	</article>
</section>

<div class="grid gap-6 lg:grid-cols-2">
	<!-- Beban per track -->
	<section class="card" aria-labelledby="judul-track">
		<div class="card-header">
			<div>
				<h2 id="judul-track" class="text-sm font-semibold">Beban per Track</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Task terbuka dan umur task tertua.
				</p>
			</div>
			<Clock class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		{#if data.tracks.length === 0}
			<p class="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
				Belum ada task produksi.
			</p>
		{:else}
			<table class="w-full text-sm">
				<caption class="sr-only">Task terbuka dan umur task tertua per track produksi</caption>
				<thead>
					<tr class="border-b border-ink-100 dark:border-ink-800">
						<th scope="col" class="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Track</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Terbuka</th>
						<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Review</th>
						<th scope="col" class="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Tertua</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.tracks as track (track.track)}
						<tr>
							<td class="px-5 py-3">
								<p class="text-sm font-medium">{track.label}</p>
								<div class="mt-1.5 h-1 w-full max-w-32 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
									<div
										class="h-full rounded-full bg-yale-700 dark:bg-yale-400"
										style="width: {Math.round((track.open / data.maxTrackOpen) * 100)}%"
									></div>
								</div>
							</td>
							<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">{track.open}</td>
							<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">
								{track.review > 0 ? track.review : '—'}
							</td>
							<td class="px-5 py-3 text-right font-mono text-xs tabular-nums">
								{track.open > 0 ? `${track.oldestDays} h` : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- Beban freelancer -->
	<section class="card" aria-labelledby="judul-freelancer">
		<div class="card-header">
			<div>
				<h2 id="judul-freelancer" class="text-sm font-semibold">Beban Freelancer</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Siapa kelebihan dan siapa bisa diberi pekerjaan.
				</p>
			</div>
			<Users class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		{#if data.loads.length === 0}
			<p class="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
				Belum ada freelancer aktif.
			</p>
		{:else}
			<ul class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.loads as row (row.userId)}
					<li class="flex items-center justify-between gap-3 px-5 py-3">
						<div class="min-w-0">
							<p class="truncate text-sm">{row.fullName}</p>
							<p class="text-[11px] text-ink-400">
								{row.completed30} selesai dalam 30 hari
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if row.overloaded}
								<StatusBadge label="Kelebihan" tone="warn" dot={false} />
							{:else if row.openTasks === 0}
								<StatusBadge label="Menganggur" tone="neutral" dot={false} />
							{/if}
							<span class="font-mono text-xs tabular-nums">{row.openTasks} task</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Risiko tenggat -->
	<section class="card overflow-hidden lg:col-span-2" aria-labelledby="judul-tenggat">
		<div class="card-header">
			<div>
				<h2 id="judul-tenggat" class="text-sm font-semibold">Risiko Tenggat</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Proyek dengan task belum selesai yang tenggatnya dalam {data.rules.deadlineWarnDays} hari
					atau sudah lewat.
				</p>
			</div>
			<AlertTriangle class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		{#if data.deadlines.length === 0}
			<p class="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
				Tidak ada proyek yang mendekati tenggat.
			</p>
		{:else}
			<div class="hidden md:block">
				<table class="w-full text-sm">
					<caption class="sr-only">Proyek berisiko telat beserta tenggat dan task terbuka</caption>
					<thead>
						<tr class="border-b border-ink-100 dark:border-ink-800">
							<th scope="col" class="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Proyek</th>
							<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Tenggat</th>
							<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Sisa</th>
							<th scope="col" class="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Task</th>
							<th scope="col" class="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">Nilai kontrak</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
						{#each data.deadlines as row (row.projectId)}
							<tr class="hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
								<td class="px-5 py-3">
									<a
										href={`/projects/${row.projectId}`}
										class="text-sm font-medium text-yale-700 hover:underline dark:text-yale-300"
									>
										{row.title}
									</a>
									<p class="font-mono text-[10px] text-ink-400">{row.orderNumber}</p>
								</td>
								<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">
									{formatDate(row.deadline)}
								</td>
								<td class="px-3 py-3 text-right">
									<span
										class="badge {row.daysLeft < 0
											? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
											: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'}"
									>
										{row.daysLeft < 0 ? `lewat ${Math.abs(row.daysLeft)} h` : `${row.daysLeft} h`}
									</span>
								</td>
								<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">{row.openTasks}</td>
								<td class="px-5 py-3 text-right font-mono text-xs tabular-nums">
									{formatIDR(row.contractValue)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<ul class="divide-y divide-ink-100 md:hidden dark:divide-ink-800">
				{#each data.deadlines as row (row.projectId)}
					<li class="px-4 py-3">
						<a
							href={`/projects/${row.projectId}`}
							class="text-sm font-medium text-yale-700 dark:text-yale-300"
						>
							{row.title}
						</a>
						<p class="mt-0.5 text-[11px] text-ink-400">
							{formatDate(row.deadline)} ·
							{row.daysLeft < 0 ? `lewat ${Math.abs(row.daysLeft)} hari` : `sisa ${row.daysLeft} hari`}
							· {row.openTasks} task terbuka
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

{#if data.stale.length > 0}
	<section class="card mt-6 overflow-hidden" aria-labelledby="judul-macet">
		<div class="card-header">
			<div>
				<h2 id="judul-macet" class="text-sm font-semibold">Task Tidak Bergerak</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Tanpa perubahan status lebih dari {data.rules.staleTaskDays} hari.
				</p>
			</div>
		</div>
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.stale as task (task.taskId)}
				<li class="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
					<div class="min-w-0">
						<p class="text-sm font-medium">{task.title}</p>
						<p class="text-[11px] text-ink-500 dark:text-ink-400">
							{task.projectTitle} · {task.track}
							{task.assigneeName ? ` · ${task.assigneeName}` : ' · belum ditugaskan'}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<StatusBadge label={`${task.daysIdle} hari`} tone={task.daysIdle >= 21 ? 'danger' : 'warn'} dot={false} />
						<a
							href={`/projects/${task.projectId}`}
							class="text-[11px] text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
						>
							Buka
						</a>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.recommendations.length > 0}
	<p class="mt-4 text-xs text-ink-400">
		{data.recommendations.length} rekomendasi produksi sudah masuk
		<a href="/dss" class="link">pusat keputusan</a>, diurutkan bersama rekomendasi kas dan judul.
	</p>
{/if}
