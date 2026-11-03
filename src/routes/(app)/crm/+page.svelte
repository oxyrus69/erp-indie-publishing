<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import CurrencyInput from '$lib/components/CurrencyInput.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatDate, formatIDR } from '$lib/ui';
	import type { DataColumn } from '$lib/table/types';
	import { ArrowRight, LayoutGrid, List, Plus, Search, X } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();
	let creating = $state(false);

	type LeadRow = PageData['rows'][number];

	/**
	 * Tahap bergerak satu langkah per klik, bukan drag-and-drop.
	 *
	 * Papan ini dipakai di ponsel juga: menyeret kartu di layar sempit selalu
	 * kalah akurat dari satu tombol yang menyebut tujuannya.
	 */
	const NEXT_STAGE: Record<string, { stage: string; label: string }> = {
		PROSPEK: { stage: 'KONTAK', label: 'Kontak' },
		KONTAK: { stage: 'PROPOSAL', label: 'Proposal' },
		PROPOSAL: { stage: 'NEGOSIASI', label: 'Negosiasi' }
	};

	const byStage = $derived(
		Object.fromEntries(
			data.activeStages.map((stage) => [
				stage,
				data.rows.filter((row: LeadRow) => row.stage === stage)
			])
		) as Record<string, LeadRow[]>
	);

	const closedRows = $derived(
		data.rows.filter((row: LeadRow) => row.stage === 'MENANG' || row.stage === 'KALAH')
	);

	const hasFilter = $derived(
		Boolean(data.filter.q || data.filter.source || data.filter.owner || data.filter.stage)
	);

	function filterHref(override: Record<string, string | null>): string {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(override)) {
			if (value === null || value === '') params.delete(key);
			else params.set(key, value);
		}
		const qs = params.toString();
		return qs ? `/crm?${qs}` : '/crm';
	}

	const createSubmit = forms.make({
		key: 'create-lead',
		successTitle: 'Prospek masuk pipeline',
		errorTitle: 'Gagal menambah prospek',
		onSuccess: () => (creating = false)
	});

	const stageSubmit = forms.make({
		key: 'stage-lead',
		successTitle: 'Tahap diperbarui',
		errorTitle: 'Tahap gagal diubah'
	});

	function contactAge(days: number | null): string {
		if (days === null) return 'belum kontak';
		return `${days} hari lalu`;
	}

	const columns: DataColumn<LeadRow>[] = [
		{ id: 'name', header: 'Prospek', mobile: 'primary', cell: nameCell },
		{ id: 'stage', header: 'Tahap', cell: stageCell },
		{ id: 'value', header: 'Estimasi', align: 'end', cell: valueCell },
		{ id: 'contact', header: 'Kontak terakhir', align: 'end', cell: contactCell },
		{ id: 'owner', header: 'Pemilik', cell: ownerCell },
		{ id: 'source', header: 'Sumber', cell: sourceCell },
		{ id: 'age', header: 'Usia', align: 'end', mobile: 'inline', cell: ageCell },
		{ id: 'created', header: 'Masuk', mobile: 'hide', cell: createdCell }
	];
</script>

<svelte:head><title>Prospek · CRM · ERP Penerbitan</title></svelte:head>

<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">CRM</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Prospek</h1>
			<p class="mt-1 max-w-[62ch] text-sm text-ink-500 dark:text-ink-400">
				Setiap baris adalah satu naskah yang sedang ditawarkan. Menang berarti orangnya menjadi
				akun penulis, lalu order dibuat dari halaman detail.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a href="/crm/aktivitas" class="btn-secondary">Aktivitas</a>
			<a href="/crm/laporan" class="btn-secondary">Laporan</a>
			<a
				href={filterHref({ view: data.view === 'board' ? 'list' : 'board' })}
				class="btn-secondary"
			>
				{#if data.view === 'board'}
					<List class="size-4" /> Tampilan daftar
				{:else}
					<LayoutGrid class="size-4" /> Tampilan papan
				{/if}
			</a>
			<button
				type="button"
				class="btn-primary"
				aria-expanded={creating}
				onclick={() => (creating = !creating)}
			>
				{#if creating}
					<X class="size-4" /> Tutup
				{:else}
					<Plus class="size-4" /> Prospek baru
				{/if}
			</button>
		</div>
	</div>
</header>

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan pipeline"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Pipeline Aktif</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.aktif}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.kpi.pipelineValue > 0 ? formatIDR(data.kpi.pipelineValue) : 'belum ada estimasi'}
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Nilai Terbobot</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{formatIDR(data.kpi.weightedValue)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">menurut peluang tiap tahap</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Menang Bulan Ini</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.winMonth}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.kpi.winValueMonth > 0 ? formatIDR(data.kpi.winValueMonth) : 'belum ada'}
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Berisiko Dingin</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.atRisk}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">tanpa kontak &gt; 30 hari</p>
	</article>
</section>

{#if creating}
	<section class="card mb-6 overflow-visible">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Prospek Baru</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Nama dan salah satu kontak wajib. Estimasi boleh kosong, tetapi harus diisi sebelum
					masuk Negosiasi.
				</p>
			</div>
		</div>

		<form
			method="POST"
			action="?/create"
			use:enhance={createSubmit}
			data-action="create-lead"
			class="space-y-4 px-5 py-4"
		>
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="label">Nama Prospek</span>
					<input
						type="text"
						name="fullName"
						class="field mt-1"
						required
						minlength="3"
						placeholder="Nama lengkap"
					/>
				</label>
				<label class="block">
					<span class="label">Email</span>
					<input type="email" name="email" class="field mt-1" placeholder="nama@contoh.id" />
					<span class="mt-1 block text-[11px] text-ink-500 dark:text-ink-400">
						Dibutuhkan saat konversi menjadi penulis.
					</span>
				</label>
				<label class="block">
					<span class="label">Telepon</span>
					<input type="tel" name="phone" class="field mt-1" placeholder="08xx" />
				</label>
				<label class="block">
					<span class="label">Sumber</span>
					<select name="source" class="field mt-1">
						{#each data.sources as source (source)}
							<option value={source}>{data.sourceLabel[source]}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Judul Buku</span>
					<input type="text" name="bookTitle" class="field mt-1" placeholder="Boleh menyusul" />
				</label>
				<label class="block">
					<span class="label">Genre</span>
					<input type="text" name="genre" class="field mt-1" placeholder="Roman, nonfiksi…" />
				</label>
				<CurrencyInput
					name="estimatedValue"
					label="Estimasi Nilai Kontrak"
					placeholder="0"
					hint="Perkiraan nilai paket + layanan. Bisa diperbarui nanti."
					class="block"
				/>
				<label class="block">
					<span class="label">Pemilik</span>
					<select name="ownerId" class="field mt-1">
						<option value="">Saya sendiri</option>
						{#each data.owners as owner (owner.id)}
							<option value={owner.id}>{owner.fullName}</option>
						{/each}
					</select>
				</label>
				<label class="block sm:col-span-2">
					<span class="label">Catatan</span>
					<textarea
						name="notes"
						rows="3"
						class="field mt-1"
						placeholder="Konteks percakapan: siapa yang menghubungi, apa yang diharapkan."
					></textarea>
				</label>
			</div>
			<div
				class="flex items-center justify-end gap-3 border-t border-ink-100 pt-4 dark:border-ink-800"
			>
				<button type="button" class="btn-secondary" onclick={() => (creating = false)}>
					Batal
				</button>
				<SubmitButton busy={forms.isBusy('create-lead')}>
					<Plus class="size-4" /> Simpan
				</SubmitButton>
			</div>
		</form>
	</section>
{/if}

<section class="card mb-6">
	<form method="GET" action="/crm" class="flex flex-wrap items-center gap-2 px-4 py-3" role="search">
		<div class="relative min-w-44 flex-1">
			<Search
				class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
				strokeWidth={1.75}
			/>
			<input
				type="search"
				name="q"
				value={data.filter.q}
				class="field !pl-9"
				placeholder="Cari nama, judul, email, genre"
				aria-label="Cari prospek"
			/>
		</div>
		{#if data.view === 'list'}
			<input type="hidden" name="view" value="list" />
		{/if}
		<label class="sr-only" for="crm-source">Filter sumber</label>
		<select
			id="crm-source"
			name="source"
			class="field !w-auto"
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="">Semua sumber</option>
			{#each data.sources as source (source)}
				<option value={source} selected={data.filter.source === source}>
					{data.sourceLabel[source]}
				</option>
			{/each}
		</select>
		<label class="sr-only" for="crm-owner">Filter pemilik</label>
		<select
			id="crm-owner"
			name="owner"
			class="field !w-auto"
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="">Semua pemilik</option>
			{#each data.owners as owner (owner.id)}
				<option value={owner.id} selected={data.filter.owner === owner.id}>{owner.fullName}</option>
			{/each}
		</select>
		{#if data.view === 'list'}
			<label class="sr-only" for="crm-stage">Filter tahap</label>
			<select
				id="crm-stage"
				name="stage"
				class="field !w-auto"
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
			>
				<option value="">Semua tahap</option>
				{#each Object.entries(data.stageLabel) as [value, label] (value)}
					<option {value} selected={data.filter.stage === value}>{label}</option>
				{/each}
			</select>
		{/if}
		<button type="submit" class="btn-secondary">Terapkan</button>
		{#if hasFilter}
			<a href="/crm" class="link px-1 text-xs">Hapus filter</a>
		{/if}
	</form>
</section>

{#if data.view === 'board'}
	<section class="space-y-6" aria-label="Papan pipeline">
		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{#each data.activeStages as stage (stage)}
				{@const leads = byStage[stage] ?? []}
				{@const valueTotal = leads.reduce(
					(sum: number, row: LeadRow) => sum + row.estimatedValue,
					0
				)}
				<section
					class="flex flex-col rounded-xl border border-ink-200/80 bg-ink-50/70 dark:border-ink-800 dark:bg-ink-950/40"
					aria-label="{data.stageLabel[stage]} · {leads.length} prospek"
				>
					<header class="flex items-baseline justify-between gap-2 px-4 pb-2.5 pt-3">
						<h2
							class="text-xs font-semibold uppercase tracking-[0.06em] text-ink-600 dark:text-ink-300"
						>
							{data.stageLabel[stage]}
							<span class="ml-1 font-mono text-ink-400">{leads.length}</span>
						</h2>
						<span class="font-mono text-[11px] tabular-nums text-ink-400">
							{valueTotal > 0 ? formatIDR(valueTotal) : '—'}
						</span>
					</header>
					<ul class="flex flex-1 flex-col gap-2 px-2 pb-2">
						{#each leads as row (row.id)}
							{@const target = NEXT_STAGE[row.stage]}
							<li class="card">
								<div class="px-4 pt-3">
									<a
										href={`/crm/${row.id}`}
										class="text-sm font-medium text-ink-900 hover:underline dark:text-ink-100"
									>
										{row.fullName}
									</a>
									<p class="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
										{row.bookTitle ? `“${row.bookTitle}”` : 'Judul belum dicatat'}
									</p>
									<div class="mt-2.5 flex items-baseline justify-between gap-2">
										<span class="font-mono text-xs tabular-nums text-ink-700 dark:text-ink-300">
											{row.estimatedValue > 0 ? formatIDR(row.estimatedValue) : '—'}
										</span>
										<span
											class="font-mono text-[11px] tabular-nums {row.daysSince === null
												? row.ageDays > 30
													? 'text-orange-700 dark:text-orange-400'
													: 'text-ink-400'
												: row.daysSince > 30
													? 'text-orange-700 dark:text-orange-400'
													: 'text-ink-400'}"
										>
											{contactAge(row.daysSince)}
										</span>
									</div>
								</div>
								<div
									class="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 px-4 py-2 dark:border-ink-800"
								>
									<span class="truncate text-[11px] text-ink-500 dark:text-ink-400">
										{row.ownerName ?? 'Tanpa pemilik'}
									</span>
									{#if target}
										<form
											method="POST"
											action="?/stage"
											use:enhance={stageSubmit}
											data-action="stage-lead"
										>
											<input type="hidden" name="leadId" value={row.id} />
											<input type="hidden" name="stage" value={target.stage} />
											<button
												type="submit"
												class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-yale-700 hover:bg-yale-50 dark:text-yale-300 dark:hover:bg-yale-950/40"
												disabled={forms.isBusy('stage-lead')}
												aria-label="Pindahkan {row.fullName} ke {target.label}"
											>
												{target.label} <ArrowRight class="size-3" />
											</button>
										</form>
									{:else}
										<a
											href={`/crm/${row.id}`}
											class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-yale-700 hover:bg-yale-50 dark:text-yale-300 dark:hover:bg-yale-950/40"
										>
											Detail <ArrowRight class="size-3" />
										</a>
									{/if}
								</div>
							</li>
						{:else}
							<li
								class="rounded-lg border border-dashed border-ink-300 px-3 py-6 text-center text-xs text-ink-400 dark:border-ink-700 dark:text-ink-500"
							>
								Belum ada prospek di tahap ini.
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>

		{#if closedRows.length > 0}
			<section aria-label="Prospek tertutup">
				<h2
					class="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-500 dark:text-ink-400"
				>
					Tertutup · {closedRows.length}
				</h2>
				<ul class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{#each closedRows as row (row.id)}
						<li class="card px-4 py-3">
							<a
								href={`/crm/${row.id}`}
								class="text-sm font-medium text-ink-700 hover:underline dark:text-ink-200"
							>
								{row.fullName}
							</a>
							<div class="mt-1.5 flex items-center justify-between gap-2">
								<StatusBadge
									label={data.stageLabel[row.stage]}
									tone={row.stage === 'MENANG' ? 'done' : 'danger'}
								/>
								<span class="font-mono text-[11px] tabular-nums text-ink-400">
									{row.estimatedValue > 0 ? formatIDR(row.estimatedValue) : '—'}
								</span>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</section>
{:else}
	<section class="card overflow-hidden">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Daftar Prospek</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					{data.rows.length} baris, terbaru diperbarui di atas.
				</p>
			</div>
		</div>
		<DataTable
			rows={data.rows}
			{columns}
			caption="Daftar prospek CRM beserta tahap, estimasi, dan kontak terakhir"
			rowHref={(row: LeadRow) => `/crm/${row.id}`}
			rowLabel={(row: LeadRow) => row.fullName}
		>
			{#snippet empty()}
				<div class="flex flex-col items-center gap-2">
					<p class="text-sm font-medium">Tidak ada prospek yang cocok</p>
					<p class="text-xs text-ink-500 dark:text-ink-400">
						Ubah kata kunci atau filter, atau catat prospek pertama lewat tombol di atas.
					</p>
					{#if hasFilter}
						<a href="/crm" class="link mt-1 text-xs">Tampilkan semua prospek</a>
					{/if}
				</div>
			{/snippet}
		</DataTable>
	</section>
{/if}

<!-- ══════════════════════════ SEL TABEL ══════════════════════════ -->

{#snippet nameCell(row: LeadRow)}
	<a href={`/crm/${row.id}`} class="group block min-w-0">
		<span
			class="block truncate text-sm font-medium text-yale-700 group-hover:underline dark:text-yale-300"
		>
			{row.fullName}
		</span>
		<span class="block truncate text-[11px] text-ink-500 dark:text-ink-400">
			{row.bookTitle ? `“${row.bookTitle}”` : 'Judul belum dicatat'}{row.genre
				? ` · ${row.genre}`
				: ''}
		</span>
	</a>
{/snippet}

{#snippet stageCell(row: LeadRow)}
	<StatusBadge
		label={data.stageLabel[row.stage]}
		tone={row.stage === 'MENANG'
			? 'done'
			: row.stage === 'KALAH'
				? 'danger'
				: row.stage === 'NEGOSIASI'
					? 'warn'
					: 'progress'}
	/>
	{#if row.health !== 'SEHAT' && row.stage !== 'MENANG' && row.stage !== 'KALAH'}
		<span class="mt-1 block text-[11px] text-orange-700 dark:text-orange-400">
			{row.health === 'PERLU_PERHATIAN' ? 'Perlu perhatian' : 'Berisiko dingin'}
		</span>
	{/if}
{/snippet}

{#snippet valueCell(row: LeadRow)}
	<span class="font-mono text-sm tabular-nums text-ink-700 dark:text-ink-300">
		{row.estimatedValue > 0 ? formatIDR(row.estimatedValue) : '—'}
	</span>
{/snippet}

{#snippet contactCell(row: LeadRow)}
	<span
		class="whitespace-nowrap font-mono text-xs tabular-nums {row.daysSince === null
			? row.ageDays > 30
				? 'text-orange-700 dark:text-orange-400'
				: 'text-ink-500 dark:text-ink-400'
			: row.daysSince > 30
				? 'text-orange-700 dark:text-orange-400'
				: 'text-ink-500 dark:text-ink-400'}"
	>
		{contactAge(row.daysSince)}
	</span>
{/snippet}

{#snippet ownerCell(row: LeadRow)}
	<span class="whitespace-nowrap text-xs text-ink-500 dark:text-ink-400">{row.ownerName ?? 'Tanpa pemilik'}</span>
{/snippet}

{#snippet sourceCell(row: LeadRow)}
	<span class="text-xs text-ink-500 dark:text-ink-400">{data.sourceLabel[row.source]}</span>
{/snippet}

{#snippet ageCell(row: LeadRow)}
	<span class="whitespace-nowrap font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
		{row.ageDays} hari
	</span>
{/snippet}

{#snippet createdCell(row: LeadRow)}
	<span class="whitespace-nowrap font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
		{formatDate(row.createdAt)}
	</span>
{/snippet}
