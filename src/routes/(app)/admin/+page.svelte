<script lang="ts">
	import { ROLE_LABEL_ID as ROLE_LABEL } from '$lib/ui';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import CashInChart from '$lib/charts/CashInChart.svelte';
	import AgingChart from '$lib/charts/AgingChart.svelte';
	import FunnelChart from '$lib/charts/FunnelChart.svelte';
	import MarginChart from '$lib/charts/MarginChart.svelte';
	import {
		INVOICE_KIND,
		INVOICE_STATUS,
		PROJECT_STATUS,
		TRACK_LABEL,
		formatDate,
		formatIDR,
		statusOf
	} from '$lib/ui';
	import {
		AlertTriangle,
		ArrowRight,
		Banknote,
		BookMarked,
		CircleDollarSign,
		Clock,
		Crown,
		FileText,
		Layers,
		ScrollText,
		TrendingUp,
		Users
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const role = $derived(data.profile?.role ?? 'PROJECT_MANAGER');
	const showFinance = $derived(role === 'SUPER_ADMIN' || role === 'FINANCE');

	const greeting = $derived(
		(() => {
			const h = new Date().getHours();
			if (h < 11) return 'Selamat pagi';
			if (h < 15) return 'Selamat siang';
			if (h < 19) return 'Selamat sore';
			return 'Selamat malam';
		})()
	);

	const needsAttention = $derived(
		[
			data.kpi.overdueCount > 0
				? {
						label: `${data.kpi.overdueCount} invoice jatuh tempo`,
						href: '/admin/finance',
						tone: 'danger' as const,
						icon: AlertTriangle
					}
				: null,
			data.kpi.tasksAwaitingReview > 0
				? {
						label: `${data.kpi.tasksAwaitingReview} hasil menunggu review penulis`,
						href: '/projects',
						tone: 'review' as const,
						icon: Clock
					}
				: null,
			data.kpi.overdueTasks > 0
				? {
						label: `${data.kpi.overdueTasks} task melewati tenggat`,
						href: '/projects',
						tone: 'warn' as const,
						icon: AlertTriangle
					}
				: null,
			data.kpi.pendingWithdrawals > 0
				? {
						label: `${data.kpi.pendingWithdrawals} penarikan menunggu persetujuan`,
						href: '/admin/finance',
						tone: 'review' as const,
						icon: Banknote
					}
				: null
		].filter((x) => x !== null)
	);
</script>

<svelte:head><title>Dasbor · ERP Penerbitan</title></svelte:head>

<!-- ══════════════════════════ HEADER ══════════════════════════ -->
<header class="mb-8">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Ringkasan Operasional</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">
				{greeting}, {data.profile?.fullName.split(' ')[0] ?? 'tim'}.
			</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				{data.kpi.activeProjects} proyek berjalan dari {data.kpi.totalProjects} kontrak ·
				{ROLE_LABEL[role]}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a href="/projects" class="btn-secondary">Semua Proyek <ArrowRight class="size-4" /></a>
			{#if showFinance}
				<a href="/admin/finance" class="btn-primary">Keuangan <ArrowRight class="size-4" /></a>
			{/if}
		</div>
	</div>

	{#if needsAttention.length > 0}
		<ul class="mt-5 flex flex-wrap gap-2">
			{#each needsAttention as item (item.label)}
				<li>
					<a
						href={item.href}
						class="badge {item.tone === 'danger'
							? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
							: item.tone === 'review'
								? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
								: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300'} transition hover:brightness-95"
					>
						<item.icon class="size-3" strokeWidth={2} />
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</header>

<!-- ══════════════════════════ KPI GRID ══════════════════════════ -->
<section class="grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800">
	<article class="bg-white px-5 py-5 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Proyek Aktif</p>
			<BookMarked class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-3 font-mono text-3xl tracking-tight tabular-nums">{data.kpi.activeProjects}</p>
		<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
			{data.kpi.awaitingAuthor} menunggu keputusan penulis
		</p>
	</article>

	<article class="bg-white px-5 py-5 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">{showFinance ? 'Kas Diterima' : 'Nilai Kontrak'}</p>
			<TrendingUp class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-3 font-mono text-2xl tracking-tight tabular-nums">
			{formatIDR(showFinance ? data.kpi.revenue : data.kpi.contracted)}
		</p>
		<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
			{#if showFinance}
				{data.kpi.collectionRate}% dari kontrak tertagih
			{:else}
				{formatIDR(data.kpi.revenue)} sudah masuk
			{/if}
		</p>
	</article>

	<article class="bg-white px-5 py-5 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Piutang</p>
			<CircleDollarSign class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-3 font-mono text-2xl tracking-tight tabular-nums">{formatIDR(data.kpi.receivable)}</p>
		<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
			{data.kpi.overdueCount} jatuh tempo · {data.kpi.unpaidCount} belum dibayar
		</p>
	</article>

	<article class="bg-white px-5 py-5 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Task Berjalan</p>
			<Layers class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-3 font-mono text-3xl tracking-tight tabular-nums">{data.kpi.tasksInProgress}</p>
		<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
			{data.kpi.tasksAwaitingReview} menunggu review
		</p>
	</article>
</section>

<!-- ══════════════════════════ GRAFIK TREN ══════════════════════════ -->
<section class="mt-6 grid gap-5 lg:grid-cols-2">
	<div class="card min-w-0 p-5">
		<CashInChart points={data.analytics.cashIn} />
	</div>
	<div class="card min-w-0 p-5">
		<AgingChart buckets={data.analytics.aging} />
	</div>
	<div class="card min-w-0 p-5">
		<FunnelChart steps={data.analytics.funnel.steps} total={data.analytics.funnel.total} />
	</div>
	<div class="card min-w-0 p-5">
		<MarginChart titles={data.analytics.margins} />
	</div>
</section>

<!-- ══════════════════════════ MAIN GRID ══════════════════════════ -->
<div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
	<div class="space-y-6">
		<!-- PROYEK TERBARU -->
		<section class="card overflow-hidden">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Proyek Terbaru</h2>
					<p class="text-xs text-ink-500 dark:text-ink-400">
						Status pipeline per track produksi paralel.
					</p>
				</div>
				<a
					href="/projects"
					class="rounded-sm text-xs font-medium text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
				>
					Lihat semua
				</a>
			</div>

			{#if data.projects.length === 0}
				<p class="px-5 py-10 text-center text-sm text-ink-400">Belum ada proyek.</p>
			{:else}
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.projects as project (project.id)}
						<li>
							<a
								href="/projects/{project.id}"
								class="group flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition hover:bg-ink-50/60 dark:hover:bg-ink-800/40"
							>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-mono text-[11px] text-ink-400">{project.orderNumber}</span>
										<StatusBadge {...statusOf(PROJECT_STATUS, project.status)} />
										{#if project.isFullyPaid}
											<span class="badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
												Lunas
											</span>
										{/if}
									</div>
									<p
										class="mt-1.5 truncate rounded-sm text-sm font-medium text-yale-700 group-hover:underline dark:text-yale-300"
									>
										{project.title}
									</p>
									<p class="truncate text-xs text-ink-500 dark:text-ink-400">
										{project.authorName} · {project.packageName}
									</p>
								</div>
								<div class="text-right">
									<p class="font-mono text-sm tabular-nums">{formatIDR(project.totalAmount)}</p>
									<p class="mt-0.5 text-[11px] text-ink-400">
										{formatDate(project.orderCreatedAt)}
									</p>
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- INVOICE PERLU TINDAKAN -->
		<section class="card overflow-hidden">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Invoice Perlu Tindakan</h2>
					<p class="text-xs text-ink-500 dark:text-ink-400">
						Pembayaran yang belum masuk menghambat track berikutnya.
					</p>
				</div>
				{#if showFinance}
					<a
						href="/admin/finance"
						class="rounded-sm text-xs font-medium text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
					>
						Keuangan
					</a>
				{/if}
			</div>

			{#if data.invoicesDue.length === 0}
				<p class="px-5 py-10 text-center text-sm text-ink-400">
					Tidak ada invoice tertunggak. Semua bersih.
				</p>
			{:else}
				<!--
					Dasbor hanya menampilkan enam invoice terbaru, jadi tabel ini
					tidak butuh penyaring atau halaman. Di ponsel barisnya menjadi
					kartu agar tidak perlu digeser horizontal.
				-->
				<ul class="divide-y divide-ink-100 md:hidden dark:divide-ink-800">
					{#each data.invoicesDue as inv (inv.id)}
						<li class="px-4 py-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="font-mono text-xs">{inv.invoiceNumber}</p>
									<p class="text-[10px] text-ink-400">
										{INVOICE_KIND[inv.kind] ?? inv.kind}{inv.dueDate
											? ` · tenggat ${formatDate(inv.dueDate)}`
											: ''}
									</p>
								</div>
								<p class="shrink-0 font-mono text-xs tabular-nums">{formatIDR(inv.amount)}</p>
							</div>
							<div class="mt-1.5 flex flex-wrap items-center justify-between gap-2">
								{#if inv.projectId}
									<a
										href="/projects/{inv.projectId}"
										class="min-w-0 truncate rounded-sm text-[11px] text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
									>
										{inv.projectTitle}
									</a>
								{:else}
									<span class="min-w-0 truncate text-[11px] text-ink-400">{inv.orderNumber}</span>
								{/if}
								<StatusBadge {...statusOf(INVOICE_STATUS, inv.status)} />
							</div>
						</li>
					{/each}
				</ul>

				<div class="hidden overflow-x-auto md:block">
					<table class="w-full text-sm">
						<caption class="sr-only">
							Enam invoice yang perlu tindakan, urut dari yang paling mendesak
						</caption>
						<thead>
							<tr class="border-b border-ink-100 text-left dark:border-ink-800">
								<th scope="col" class="px-5 py-2 font-medium text-[11px] uppercase tracking-[0.08em] text-ink-400">Invoice</th>
								<th scope="col" class="px-3 py-2 font-medium text-[11px] uppercase tracking-[0.08em] text-ink-400">Proyek</th>
								<th scope="col" class="px-3 py-2 text-right font-medium text-[11px] uppercase tracking-[0.08em] text-ink-400">Nilai</th>
								<th scope="col" class="px-5 py-2 text-right font-medium text-[11px] uppercase tracking-[0.08em] text-ink-400">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
							{#each data.invoicesDue as inv (inv.id)}
								<tr class="hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
									<td class="px-5 py-3">
										<p class="font-mono text-xs">{inv.invoiceNumber}</p>
										<p class="text-[11px] text-ink-400">
											{INVOICE_KIND[inv.kind] ?? inv.kind}{inv.dueDate ? ` · tenggat ${formatDate(inv.dueDate)}` : ''}
										</p>
									</td>
									<td class="max-w-[16rem] px-3 py-3">
										{#if inv.projectId}
											<a
												href="/projects/{inv.projectId}"
												class="truncate rounded-sm text-xs text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
											>
												{inv.projectTitle}
											</a>
										{:else}
											<span class="truncate text-xs text-ink-400">{inv.orderNumber}</span>
										{/if}
									</td>
									<td class="px-3 py-3 text-right font-mono text-xs tabular-nums">
										{formatIDR(inv.amount)}
									</td>
									<td class="px-5 py-3 text-right">
										<StatusBadge {...statusOf(INVOICE_STATUS, inv.status)} />
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>

	<!-- ══════════════════════ SIDEBAR ══════════════════════ -->
	<div class="space-y-6">
		<!-- BEBAN KERJA TRACK -->
		<section class="card">
			<div class="card-header">
				<h2 class="text-sm font-semibold">Beban Kerja Track</h2>
			</div>
			<ul class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.trackLoad as t (t.track)}
					<li class="flex items-center justify-between gap-3 px-5 py-3">
						<div class="min-w-0">
							<p class="text-xs font-medium">{TRACK_LABEL[t.track] ?? t.track}</p>
							<p class="text-[11px] text-ink-400">
								{t.review > 0 ? `${t.review} menunggu review` : 'tidak ada antrean review'}
							</p>
						</div>
						<div class="flex items-center gap-2">
							<!--
								Beban per track: 4 task terbuka = penuh. Nilai mentah tetap
								ditampilkan di sebelah bar supaya persentase tidak menipu.
							-->
							<ProgressBar
								class="w-16"
								value={t.open * 25}
								label={`Beban ${TRACK_LABEL[t.track] ?? t.track}`}
								showValue={false}
								size="sm"
							/>
							<span class="w-5 text-right font-mono text-xs tabular-nums">{t.open}</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<!-- KEWAJIBAN -->
		<section class="card">
			<div class="card-header">
				<h2 class="text-sm font-semibold">Kewajiban Berjalan</h2>
			</div>
			<dl class="divide-y divide-ink-100 dark:divide-ink-800">
				<div class="flex items-center justify-between px-5 py-3">
					<dt class="text-xs text-ink-500 dark:text-ink-400">Saldo freelancer</dt>
					<dd class="font-mono text-xs tabular-nums">{formatIDR(data.kpi.freelancerPayable)}</dd>
				</div>
				<div class="flex items-center justify-between px-5 py-3">
					<dt class="text-xs text-ink-500 dark:text-ink-400">Royalti penulis</dt>
					<dd class="font-mono text-xs tabular-nums">{formatIDR(data.kpi.royaltyEarned)}</dd>
				</div>
				<div class="flex items-center justify-between px-5 py-3">
					<dt class="text-xs text-ink-500 dark:text-ink-400">Penarikan tertunda</dt>
					<dd class="font-mono text-xs tabular-nums">
						{formatIDR(data.kpi.pendingWithdrawalAmount)}
					</dd>
				</div>
			</dl>
		</section>

		<!-- TIM FREELANCER -->
		<section class="card">
			<div class="card-header">
				<h2 class="text-sm font-semibold">Tim Freelancer</h2>
				<Users class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>
			<div class="px-5 py-4">
				<p class="font-mono text-2xl tabular-nums">
					{data.activeFreelancers}<span class="text-sm text-ink-400">/{data.totalFreelancers}</span>
				</p>
				<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">Aktif dan bisa ditugaskan</p>
			</div>
		</section>

		<!-- MENUNGGU PENULIS -->
		{#if data.awaitingAuthorProjects.length > 0}
			<section class="card">
				<div class="card-header">
					<h2 class="text-sm font-semibold">Menunggu Penulis</h2>
					<Crown class="size-4 text-amber-500" strokeWidth={1.5} />
				</div>
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.awaitingAuthorProjects as p (p.id)}
						<li>
							<a
								href="/projects/{p.id}"
								class="block px-5 py-3 transition hover:bg-ink-50/60 dark:hover:bg-ink-800/40"
							>
								<p class="truncate text-xs font-medium">{p.title}</p>
								<p class="text-[11px] text-ink-400">{p.authorName}</p>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- PERLU DISAPA ULANG (CRM) -->
		{#if data.authorsToReach.length > 0}
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Penulis Perlu Disapa</h2>
						<p class="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
							Tanpa kontak &gt; 30 hari, tanpa order berjalan
						</p>
					</div>
					<Users class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.authorsToReach as person (person.id)}
						<li>
							<a
								href={`/admin/penulis/${person.id}`}
								class="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-ink-50/60 dark:hover:bg-ink-800/40"
							>
								<span class="min-w-0">
									<span class="block truncate text-xs font-medium">{person.fullName}</span>
									<span class="block truncate text-[11px] text-ink-400">
										{person.daysSinceContact === null
											? 'belum pernah lewat CRM'
											: `${person.daysSinceContact} hari tanpa kabar`}
									</span>
								</span>
								<span class="shrink-0 font-mono text-[11px] tabular-nums text-ink-400">
									{person.orderCount} order
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- PENARIKAN -->
		{#if data.withdrawals.length > 0}
			<section class="card">
				<div class="card-header">
					<h2 class="text-sm font-semibold">Penarikan Terbaru</h2>
					<ScrollText class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.withdrawals as w (w.id)}
						<li class="flex items-center justify-between gap-3 px-5 py-3">
							<div class="min-w-0">
								<p class="truncate text-xs font-medium">{w.userName}</p>
								<p class="text-[11px] text-ink-400">
									{w.wallet === 'ROYALTY' ? 'Royalti' : 'Komisi'}
								</p>
							</div>
							<div class="text-right">
								<p class="font-mono text-xs tabular-nums">{formatIDR(w.amount)}</p>
								<p class="text-[11px] text-ink-400">{w.status === 'REQUESTED' ? 'Diminta' : 'Disetujui'}</p>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
</div>
