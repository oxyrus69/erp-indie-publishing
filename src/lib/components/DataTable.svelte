<script lang="ts" generics="T extends { id: string }">
	import {
		createTable,
		tableFeatures,
		rowSelectionFeature,
		type RowSelectionState,
		type Updater
	} from '@tanstack/svelte-table';
	import { functionalUpdate } from '@tanstack/table-core';
	import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import type { DataColumn } from '$lib/table/types';

	/**
	 * Satu tabel untuk semua daftar.
	 *
	 * Dua masalah lama diselesaikan bersamaan:
	 *
	 *  1. **Satu sumber data.** Sebelumnya ponsel memakai blok kartu hasil salin
	 *     tempel dan desktop memakai `<table>`; keduanya cepat melenceng. Di sini
	 *     keduanya dirender dari array `columns` yang sama, memakai snippet sel
	 *     yang sama. Tidak ada markup data ganda.
	 *  2. **Tabel yang bisa dibaca mesin.** `<caption>`, `scope="col"` di setiap
	 *     `<th>`, dan `aria-sort` di kolom yang sedang diurutkan. Tanpa itu
	 *     pembaca layar tidak tahu kolom mana milik nilai mana.
	 *
	 * Pengurutan sengaja berupa tautan biasa, bukan tombol JS: URL bisa dibagikan,
	 * tombol back bekerja, dan daftar tetap bisa diurutkan tanpa JavaScript.
	 * TanStack Table dipakai untuk state baris terpilih (checkbox), karena
	 * seleksi harus tetap stabil saat data halaman diganti.
	 */

	let {
		rows,
		columns,
		caption,
		sort = null,
		sortHref,
		selectable = false,
		selected = [],
		onselectionchange,
		empty,
		rowHref,
		rowLabel
	}: {
		rows: T[];
		columns: DataColumn<T>[];
		/** Wajib: dibacakan sebagai nama tabel, dan tampil di atas tabel. */
		caption: string;
		sort?: { id: string; dir: 'asc' | 'desc' } | null;
		/** Membangun URL untuk mengurutkan kolom. Bila kosong, kolom tidak diurutkan. */
		sortHref?: (columnId: string) => string;
		selectable?: boolean;
		selected?: string[];
		onselectionchange?: (ids: string[]) => void;
		empty?: Snippet;
		/** Tautan baris penuh (dipakai di kartu ponsel). */
		rowHref?: (row: T) => string;
		rowLabel?: (row: T) => string;
	} = $props();

	const features = tableFeatures({ rowSelectionFeature });

	const table = createTable({
		features,
		get data() {
			return rows;
		},
		get columns() {
			return columns.map((column) => ({ id: column.id, header: column.header }));
		},
		getRowId: (row: T) => row.id,
		get enableRowSelection() {
			return selectable;
		},
		get state() {
			return { rowSelection: toSelectionState(selected) };
		},
		onRowSelectionChange: (updater: Updater<RowSelectionState>) => {
			const next = functionalUpdate(updater, toSelectionState(selected));
			onselectionchange?.(Object.keys(next).filter((id) => next[id]));
		}
	});

	function toSelectionState(ids: string[]): RowSelectionState {
		return Object.fromEntries(ids.map((id) => [id, true as const]));
	}

	const mobileColumns = $derived(columns.filter((c) => (c.mobile ?? 'inline') !== 'hide'));
	const sortableColumns = $derived(sortHref ? columns.filter((c) => c.sortable !== false) : []);
	const primaryColumn = $derived(
		columns.find((c) => c.mobile === 'primary') ?? columns[0] ?? null
	);

	function ariaSort(columnId: string): 'ascending' | 'descending' | 'none' {
		if (!sort || sort.id !== columnId) return 'none';
		return sort.dir === 'asc' ? 'ascending' : 'descending';
	}

	function sortOf(column: DataColumn<T>): { id: string; dir: 'asc' | 'desc' } | null {
		return sort?.id === column.id ? sort : null;
	}

	/** Kolom yang benar-benar bisa diurutkan: ada URL dan ditandai sortable. */
	function canSort(column: DataColumn<T>): boolean {
		return Boolean(sortHref) && column.sortable !== false;
	}

	const allPageSelected = $derived(
		rows.length > 0 && rows.every((row) => selected.includes(row.id))
	);
	const somePageSelected = $derived(
		!allPageSelected && rows.some((row) => selected.includes(row.id))
	);

	function toggleAll(): void {
		if (allPageSelected) {
			onselectionchange?.(selected.filter((id) => !rows.some((row) => row.id === id)));
		} else {
			onselectionchange?.([...new Set([...selected, ...rows.map((row) => row.id)])]);
		}
	}

	function toggleRow(id: string): void {
		onselectionchange?.(
			selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
		);
	}

	const alignClass = (column: DataColumn<T>) =>
		column.align === 'end' ? 'text-right' : 'text-left';
</script>

<div class="hidden md:block">
	<!--
		Tabel lebar bisa menggulir HORIZONTAL DI DALAM kartunya sendiri, bukan
		seluruh halaman. Di ponsel pola yang dipakai adalah kartu (di bawah), jadi
		tidak ada tabel yang harus digeser.
	-->
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
		<caption class="sr-only">{caption}</caption>
		<thead>
			<tr class="border-b border-ink-100 dark:border-ink-800">
				{#if selectable}
					<th scope="col" class="w-10 px-3 py-2.5">
						<input
							type="checkbox"
							class="size-3.5 rounded border-ink-300 align-middle dark:border-ink-600"
							checked={allPageSelected}
							indeterminate={somePageSelected}
							onchange={toggleAll}
							aria-label="Pilih semua baris di halaman ini"
						/>
					</th>
				{/if}
				{#each columns as column (column.id)}
					<th
						scope="col"
						class="{alignClass(column)} whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400 first:pl-5 last:pr-5"
						aria-sort={canSort(column) ? ariaSort(column.id) : undefined}
					>
						{#if canSort(column) && sortHref}
							{@const state = sortOf(column)}
							<a
								href={sortHref(column.id)}
								class="inline-flex items-center gap-1 rounded-sm transition hover:text-ink-700 dark:hover:text-ink-200"
							>
								{column.header}
								{#if state?.dir === 'asc'}
									<ChevronUp class="size-3" strokeWidth={2.5} />
								{:else if state?.dir === 'desc'}
									<ChevronDown class="size-3" strokeWidth={2.5} />
								{:else}
									<ChevronsUpDown class="size-3 opacity-40" strokeWidth={2} />
								{/if}
								<span class="sr-only">
									{#if state?.dir === 'asc'}
										, urut naik. Aktifkan untuk urut turun.
									{:else if state?.dir === 'desc'}
										, urut turun. Aktifkan untuk membatalkan urutan.
									{:else}
										, belum diurutkan. Aktifkan untuk urut naik.
									{/if}
								</span>
							</a>
						{:else}
							{column.header}
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each rows as row (row.id)}
				<tr class="hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
					{#if selectable}
						<td class="w-10 px-3 py-3">
							<input
								type="checkbox"
								class="size-3.5 rounded border-ink-300 align-middle dark:border-ink-600"
								checked={selected.includes(row.id)}
								onchange={() => toggleRow(row.id)}
								aria-label={`Pilih ${rowLabel?.(row) ?? row.id}`}
							/>
						</td>
					{/if}
					{#each columns as column (column.id)}
						<td
							class="{alignClass(column)} px-3 py-3 align-top first:pl-5 last:pr-5"
						>
							{@render column.cell(row)}
						</td>
					{/each}
				</tr>
			{:else}
				<tr>
					<td colspan={columns.length + (selectable ? 1 : 0)} class="px-5 py-14 text-center">
						{#if empty}
							{@render empty()}
						{:else}
							<p class="text-sm text-ink-500 dark:text-ink-400">Tidak ada data.</p>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	</div>
</div>

<!-- Ponsel: kartu dari kolom yang sama, bukan salinan markup terpisah. -->
<div class="md:hidden">
	<!-- Baris urut ponsel: tabel tersembunyi di bawah md, header-sort-nya tidak
	     terjangkau, jadi pilihan kolom urut tampil lagi sebagai chips. -->
	{#if sortableColumns.length > 0}
		<div class="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
			<span class="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-400">Urutkan</span>
			{#each sortableColumns as column (column.id)}
				{@const state = sortOf(column)}
				<a
					href={sortHref?.(column.id)}
					aria-current={state ? 'true' : undefined}
					class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition
						{state
							? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600'
							: 'border-ink-200 bg-white text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400'}"
				>
					{column.header}
					{#if state?.dir === 'asc'}
						<ChevronUp class="size-3" strokeWidth={2.5} />
					{:else if state?.dir === 'desc'}
						<ChevronDown class="size-3" strokeWidth={2.5} />
					{/if}
					<span class="sr-only">
						{#if state?.dir === 'asc'}
							diurutkan naik; aktifkan untuk urut turun
						{:else if state?.dir === 'desc'}
							diurutkan turun; aktifkan untuk membatalkan urutan
						{:else}
							belum diurutkan; aktifkan untuk urut naik
						{/if}
					</span>
				</a>
			{/each}
		</div>
	{/if}

	<ul class="divide-y divide-ink-100 dark:divide-ink-800">
	{#each rows as row (row.id)}
		{@const primary = primaryColumn}
		<li class="px-4 py-4">
			<div class="flex items-start gap-3">
				{#if selectable}
					<input
						type="checkbox"
						class="mt-0.5 size-4 shrink-0 rounded border-ink-300 dark:border-ink-600"
						checked={selected.includes(row.id)}
						onchange={() => toggleRow(row.id)}
						aria-label={`Pilih ${rowLabel?.(row) ?? row.id}`}
					/>
				{/if}
				<div class="min-w-0 flex-1">
					{#if primary}
						{@render primary.cell(row)}
					{/if}
				</div>
			</div>

			{#if rowHref}
				<a href={rowHref(row)} class="mt-2 inline-block text-xs font-medium text-yale-700 dark:text-yale-300">
					Buka detail <span class="sr-only">{rowLabel?.(row) ?? ''}</span>
				</a>
			{/if}
			<dl class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
				{#each mobileColumns as column (column.id)}
					{#if column.id !== primary?.id}
						{@const role = column.mobile ?? 'inline'}
						<div class={role === 'block' ? 'col-span-2' : ''}>
							<dt class="text-[10px] uppercase tracking-[0.06em] text-ink-400">{column.header}</dt>
							<dd class="mt-0.5 text-xs text-ink-700 dark:text-ink-200">
								{@render column.cell(row)}
							</dd>
						</div>
					{/if}
				{/each}
			</dl>
		</li>
	{:else}
		<li class="px-5 py-14 text-center">
			{#if empty}
				{@render empty()}
			{:else}
				<p class="text-sm text-ink-500 dark:text-ink-400">Tidak ada data.</p>
			{/if}
		</li>
	{/each}
</ul>
</div>
