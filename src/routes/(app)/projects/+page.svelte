<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import TableToolbar from '$lib/components/TableToolbar.svelte';
	import TablePager from '$lib/components/TablePager.svelte';
	import {
		COVER_STAGE,
		EDITORIAL_STAGE,
		LEGAL_STAGE,
		PRINT_STAGE,
		PROJECT_STATUS,
		TONE_CLASS,
		TONE_DOT,
		formatDate,
		formatIDR,
		statusOf
	} from '$lib/ui';
	import { nextSort, tableHref } from '$lib/table/query';
	import type { DataColumn } from '$lib/table/types';
	import { AlertTriangle, ArrowRight, BookOpen } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Project = PageData['projects'][number];

	const TRACKS = [
		{ key: 'editorial', label: 'Editorial', map: EDITORIAL_STAGE },
		{ key: 'cover', label: 'Cover', map: COVER_STAGE },
		{ key: 'legal', label: 'Legal', map: LEGAL_STAGE },
		{ key: 'print', label: 'Cetak', map: PRINT_STAGE }
	] as const;

	function stageOf(track: (typeof TRACKS)[number], project: Project) {
		switch (track.key) {
			case 'editorial':
				return statusOf(EDITORIAL_STAGE, project.editorialStage);
			case 'cover':
				return statusOf(COVER_STAGE, project.coverStage);
			case 'legal':
				return statusOf(LEGAL_STAGE, project.legalStage);
			default:
				return statusOf(PRINT_STAGE, project.printStage);
		}
	}

	/** Filter cepat per status — tetap berupa tautan agar URL bisa dibagikan. */
	const statusFilters = $derived([
		{ value: '', label: 'Semua', count: data.kpi.totalProjects },
		...Object.keys(data.countByStatus)
			.sort((a, b) => (data.countByStatus[b] ?? 0) - (data.countByStatus[a] ?? 0))
			.map((key) => ({
				value: key,
				label: statusOf(PROJECT_STATUS, key).label,
				count: data.countByStatus[key] ?? 0
			}))
	]);

	const sortHref = (columnId: string) =>
		tableHref('/projects', data.query, nextSort(data.query, columnId));

	const columns: DataColumn<Project>[] = [
		{
			id: 'title',
			header: 'Buku',
			mobile: 'primary',
			cell: bookCell
		},
		{ id: 'package', header: 'Paket', sortable: false, cell: packageCell },
		{ id: 'stage', header: 'Tahap', sortable: false, mobile: 'block', cell: stageCell },
		{ id: 'payment', header: 'Pembayaran', align: 'end', sortable: false, cell: paymentCell },
		{ id: 'tasks', header: 'Artisan', align: 'end', sortable: false, cell: taskCell },
		{ id: 'status', header: 'Status', align: 'end', cell: statusCell }
	];
</script>

<svelte:head><title>Proyek · ERP Penerbitan</title></svelte:head>

<!-- ══════════════════════════ HEADER ══════════════════════════ -->
<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Portofolio Produksi</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Proyek Buku</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				{data.kpi.active} berjalan · {data.kpi.awaitingAuthor} menunggu penulis · {data.kpi.published}
				telah terbit
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a href="/admin" class="btn-secondary">Dasbor <ArrowRight class="size-4" /></a>
			<a href="/admin/finance" class="btn-primary">Keuangan <ArrowRight class="size-4" /></a>
		</div>
	</div>

	{#if data.kpi.needsAttention > 0 || data.kpi.inReview > 0}
		<ul class="mt-5 flex flex-wrap gap-2">
			{#if data.kpi.needsAttention > 0}
				<li>
					<a
						href={tableHref('/projects', data.query, {
							attention: data.query.filters.attention === '1' ? null : '1',
							page: null
						})}
						class="badge transition hover:brightness-95 {data.query.filters.attention === '1'
							? TONE_CLASS.danger
							: 'border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300'}"
						aria-current={data.query.filters.attention === '1' ? 'true' : undefined}
					>
						<AlertTriangle class="size-3" strokeWidth={2} />
						{data.kpi.needsAttention} proyek perlu tindakan
						{data.query.filters.attention === '1' ? '· filter aktif' : '· saring'}
					</a>
				</li>
			{/if}
			{#if data.kpi.inReview > 0}
				<li>
					<span class="badge {TONE_CLASS.review}">
						{data.kpi.inReview} hasil menunggu review penulis
					</span>
				</li>
			{/if}
		</ul>
	{/if}
</header>

<!-- ══════════════════════════ KPI ══════════════════════════ -->
<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Total Proyek</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.totalProjects}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{data.kpi.active} masih berjalan</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Nilai Belum Tertagih</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.receivable)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Dari invoice yang belum lunas</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Menunggu Penulis</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.awaitingAuthor}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Review layout atau cover</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Selesai Terbit</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.published}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Sudah masuk katalog</p>
	</article>
</section>

<!-- ══════════════════════════ FILTER STATUS ══════════════════════════ -->
<div class="mb-4 flex flex-wrap items-center gap-1.5">
	{#each statusFilters as filter (filter.value || 'all')}
		<a
			href={tableHref('/projects', data.query, { status: filter.value || null, page: null })}
			aria-current={data.query.filters.status === filter.value ||
			(!data.query.filters.status && filter.value === '')
				? 'true'
				: undefined}
			class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
				{(data.query.filters.status ?? '') === filter.value
				? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600 dark:text-white'
				: 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'}"
		>
			{filter.label}
			<span class="ml-1 font-mono text-[10px] opacity-60">{filter.count}</span>
		</a>
	{/each}
</div>

<!-- ══════════════════════════ TABEL ══════════════════════════ -->
<section class="card overflow-hidden">
	<div class="px-5 pt-4">
		<TableToolbar
			action="/projects"
			query={data.query.q}
			searchPlaceholder="Cari judul, penulis, order, ISBN…"
			searchLabel="Cari proyek"
			size={data.query.size}
			hidden={{ sort: data.query.sort, dir: data.query.dir, ...data.query.filters }}
			filters={[
				{
					name: 'status',
					label: 'Status',
					value: data.query.filters.status ?? '',
					options: Object.keys(PROJECT_STATUS).map((key) => ({
						value: key,
						label: statusOf(PROJECT_STATUS, key).label
					}))
				}
			]}
		/>
	</div>

	<DataTable
		rows={data.projects}
		{columns}
		caption="Daftar proyek buku beserta status pembayaran dan progres produksi"
		sort={{ id: data.query.sort, dir: data.query.dir }}
		{sortHref}
		rowHref={(project) => `/projects/${project.id}`}
		rowLabel={(project) => project.title}
	>
		{#snippet empty()}
			<div class="flex flex-col items-center gap-2">
				<BookOpen class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				<p class="text-sm font-medium">Tidak ada proyek yang cocok</p>
				<p class="text-xs text-ink-500 dark:text-ink-400">
					Ubah kata kunci, status, atau filter tindakan untuk melihat proyek lain.
				</p>
				<a href="/projects" class="link mt-1 text-xs">Tampilkan semua proyek</a>
			</div>
		{/snippet}
	</DataTable>

	<TablePager
		from={data.query.from}
		to={data.query.to}
		total={data.query.total}
		page={data.query.page}
		totalPages={data.query.totalPages}
		href={(page) => tableHref('/projects', data.query, { page })}
		noun="proyek"
	/>
</section>

<!-- ══════════════════════════ SEL ══════════════════════════ -->

{#snippet bookCell(project: Project)}
	<a href="/projects/{project.id}" class="group block min-w-0">
		<span class="block truncate text-sm font-medium text-yale-700 group-hover:underline dark:text-yale-300">
			{project.title}
		</span>
		<span class="block truncate text-[11px] text-ink-500 dark:text-ink-400">
			{project.authorName}{project.genre ? ` · ${project.genre}` : ''}{project.pageCount
				? ` · ${project.pageCount} hlm`
				: ''}
		</span>
		<span class="block font-mono text-[10px] text-ink-400">{project.orderNumber}</span>
	</a>
{/snippet}

{#snippet packageCell(project: Project)}
	<span class="text-xs text-ink-600 dark:text-ink-300">{project.packageName}</span>
{/snippet}

{#snippet stageCell(project: Project)}
	<ul class="space-y-1">
		{#each TRACKS as track (track.key)}
			{@const stage = stageOf(track, project)}
			<li class="flex items-center gap-1.5">
				<span class="size-1.5 shrink-0 rounded-full {TONE_DOT[stage.tone]}"></span>
				<span class="w-14 shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
					{track.label}
				</span>
				<span class="truncate text-[11px] text-ink-600 dark:text-ink-300">{stage.label}</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet paymentCell(project: Project)}
	<p class="font-mono text-xs tabular-nums">{formatIDR(project.paidNum)}</p>
	<p class="text-[11px] text-ink-400">dari {formatIDR(project.billedNum)}</p>
	<div class="mt-1 h-1 w-20 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800 md:ml-auto">
		<div class="h-full rounded-full bg-yale-700 dark:bg-yale-400" style="width: {project.paidPct}%"></div>
	</div>
	{#if project.outstandingNum > 0}
		<p class="mt-1 text-[10px] text-ink-400">
			Sisa {formatIDR(project.outstandingNum)}
			{#if project.hasOverdueInvoice}
				<span class="text-red-600 dark:text-red-400">· jatuh tempo</span>
			{/if}
		</p>
	{/if}
{/snippet}

{#snippet taskCell(project: Project)}
	<p class="font-mono text-xs tabular-nums">{project.taskDone}/{project.taskTotal}</p>
	<p class="text-[11px] text-ink-400">task selesai</p>
	{#if project.tasksInReview > 0}
		<p class="text-[10px] text-amber-600 dark:text-amber-400">{project.tasksInReview} di review</p>
	{/if}
	{#if project.overdueTasks > 0}
		<p class="text-[10px] text-red-600 dark:text-red-400">{project.overdueTasks} lewat tenggat</p>
	{/if}
{/snippet}

{#snippet statusCell(project: Project)}
	<div class="flex flex-col gap-1 md:items-end">
		<StatusBadge {...statusOf(PROJECT_STATUS, project.status)} />
		<p class="text-[10px] text-ink-400">Diperbarui {formatDate(project.updatedAt)}</p>
	</div>
{/snippet}
