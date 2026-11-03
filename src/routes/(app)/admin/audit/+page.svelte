<script lang="ts">
	import PeriodPicker from '$lib/components/PeriodPicker.svelte';
	import TablePager from '$lib/components/TablePager.svelte';
	import TableToolbar from '$lib/components/TableToolbar.svelte';
	import { tableHref } from '$lib/table/query';
	import { quickPeriods } from '$lib/table/period';
	import { ROLE_LABEL_ID, formatDateTime } from '$lib/ui';
	import { ScrollText } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const quick = quickPeriods();

	const ENTITY_OPTIONS = [
		{ value: 'invoice', label: 'invoice' },
		{ value: 'withdrawal', label: 'penarikan' },
		{ value: 'project', label: 'proyek' },
		{ value: 'task', label: 'task' },
		{ value: 'revision', label: 'revisi' },
		{ value: 'print_run', label: 'cetak' },
		{ value: 'sale', label: 'penjualan' }
	];

	/** Nilai diff ditampilkan singkat; boolean jadi Ya/Tidak agar terbaca. */
	function showValue(value: unknown): string {
		if (value === null || value === undefined || value === '') return '—';
		if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}
</script>

<svelte:head><title>Jejak Aktivitas · ERP Penerbitan</title></svelte:head>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Audit Trail</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Jejak Aktivitas</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				Catatan aksi yang mengubah uang, status, atau isi karya — siapa, kapan, dari nilai apa
				ke nilai apa.
			</p>
		</div>
		<a href="/admin" class="btn-secondary">Dasbor</a>
	</div>
</header>

<PeriodPicker
	period={data.period}
	{quick}
	action="/admin/audit"
	hidden={{ sort: data.query.sort, dir: data.query.dir, size: String(data.query.size) }}
/>

<section class="card overflow-hidden">
	<div class="px-5 pt-4">
		<TableToolbar
			action="/admin/audit"
			query={data.query.q}
			searchPlaceholder="Cari ringkasan atau nama pelaku…"
			size={data.query.size}
			hidden={{
				sort: data.query.sort,
				dir: data.query.dir,
				...(data.period.month ? { month: data.period.month } : {}),
				...(data.period.from ? { from: data.period.from } : {}),
				...(data.period.to ? { to: data.period.to } : {})
			}}
			filters={[
				{
					name: 'entity',
					label: 'Entitas',
					value: data.query.filters.entity ?? '',
					options: ENTITY_OPTIONS
				}
			]}
		/>
	</div>

	{#if data.entries.length === 0}
		<div class="flex flex-col items-center gap-2 px-5 py-16 text-center">
			<ScrollText class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			<p class="text-sm font-medium">Belum ada aktivitas tercatat</p>
			<p class="max-w-sm text-xs text-ink-500 dark:text-ink-400">
				Jejak muncul setelah ada verifikasi pembayaran, perubahan spesifikasi, penugasan, atau
				proses penarikan.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.entries as entry (entry.id)}
				<li class="px-5 py-4">
					<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
						<div class="flex flex-wrap items-baseline gap-x-2">
							<span class="badge border-ink-200 bg-ink-50 text-[10px] text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
								{entry.entityLabel}
							</span>
							<p class="text-sm font-medium">{entry.actionLabel}</p>
						</div>
						<p class="text-[11px] text-ink-400">{formatDateTime(entry.createdAt)}</p>
					</div>

					<p class="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
						{entry.summary}
					</p>

					<p class="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
						{entry.actorName}
						<span class="text-ink-400">
							· {ROLE_LABEL_ID[entry.actorRole] ?? entry.actorRole}
						</span>
						{#if entry.projectTitle}
							· <a
								href="/projects/{entry.entityId}"
								class="text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
							>
								{entry.projectTitle}
							</a>
						{/if}
					</p>

					{#if entry.changes}
						<div class="mt-2 overflow-x-auto">
							<table class="w-full text-[11px]">
								<caption class="sr-only">Perubahan nilai pada aksi ini</caption>
								<thead>
									<tr class="border-b border-ink-100 text-left dark:border-ink-800">
										<th scope="col" class="py-1 pr-3 font-medium text-ink-400">Field</th>
										<th scope="col" class="py-1 pr-3 font-medium text-ink-400">Sebelum</th>
										<th scope="col" class="py-1 font-medium text-ink-400">Sesudah</th>
									</tr>
								</thead>
								<tbody>
									{#each Object.entries(entry.changes) as [field, change] (field)}
										<tr class="border-b border-ink-100 last:border-0 dark:border-ink-800">
											<td class="py-1 pr-3 font-mono text-ink-500">{field}</td>
											<td class="py-1 pr-3 font-mono text-ink-500 line-through decoration-ink-300">
												{showValue(change.from)}
											</td>
											<td class="py-1 font-mono font-medium">{showValue(change.to)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<TablePager
		from={data.query.from}
		to={data.query.to}
		total={data.query.total}
		page={data.query.page}
		totalPages={data.query.totalPages}
		href={(page) =>
			tableHref('/admin/audit', data.query, { page, ...(data.period.month ? { month: data.period.month } : {}) })}
		noun="aktivitas"
	/>
</section>
