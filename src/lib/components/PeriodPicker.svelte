<script lang="ts">
	import { CalendarDays } from 'lucide-svelte';
	import type { Period } from '$lib/table/period';

	/**
	 * Pemilih periode berbasis tautan, bukan state JS.
	 *
	 * Setiap pilihan adalah `<a href>` biasa: hasil laporan bisa dikirim ke
	 * rekan kerja, tombol back mengembalikan periode sebelumnya, dan cetak
	 * mengikuti apa yang sedang tampil. Form tanggal memakai `method="get"`
	 * sehingga tetap bekerja tanpa JavaScript.
	 */
	let {
		period,
		quick = [],
		action = '',
		hidden = {}
	}: {
		period: Period;
		quick?: { key: string; label: string; params: Record<string, string> }[];
		action?: string;
		hidden?: Record<string, string>;
	} = $props();

	/** Pil mana yang sedang aktif; `custom` bila tidak ada yang cocok. */
	const activeKey = $derived(
		period.isAllTime
			? 'all'
			: (quick.find((option) => {
					const p = option.params;
					if (p.month) return period.month === p.month;
					if (!p.from && !p.to) return false;
					return period.from === (p.from ?? null) && period.to === (p.to ?? null);
				})?.key ?? 'custom')
	);

	function hrefFor(params: Record<string, string>): string {
		const search = new URLSearchParams({ ...hidden, ...params });
		const qs = search.toString();
		return qs ? `?${qs}` : '?';
	}
</script>

<div class="no-print mb-4 flex flex-wrap items-center gap-1.5">
	<span class="flex items-center gap-1.5 pr-1 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-400">
		<CalendarDays class="size-3" strokeWidth={2} /> Periode
	</span>

	{#each quick as option (option.key)}
		<a
			href={hrefFor(option.params)}
			aria-current={activeKey === option.key ? 'true' : undefined}
			class="rounded-full border px-2.5 py-1 text-[11px] font-medium transition
				{activeKey === option.key
				? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600 dark:text-white'
				: 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'}"
		>
			{option.label}
		</a>
	{/each}

	<details class="relative">
		<summary
			class="cursor-pointer list-none rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 marker:content-none"
			aria-label="Rentang tanggal khusus"
		>
			{activeKey === 'custom' ? period.label : 'Rentang…'}
		</summary>

		<form
			{action}
			method="GET"
			class="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-lg border border-ink-200 bg-white p-3 shadow-lg dark:border-ink-700 dark:bg-ink-900"
		>
			{#each Object.entries(hidden) as [name, value] (name)}
				<input type="hidden" {name} value={value} />
			{/each}

			<label class="block text-[10px] font-medium uppercase tracking-[0.06em] text-ink-400" for="period-from">
				Dari
			</label>
			<input
				id="period-from"
				type="date"
				name="from"
				aria-label="Tanggal mulai"
				value={period.from ?? ''}
				class="field mt-1 !py-1.5 !text-xs"
			/>

			<label
				class="mt-2 block text-[10px] font-medium uppercase tracking-[0.06em] text-ink-400"
				for="period-to"
			>
				Sampai
			</label>
			<input
				id="period-to"
				type="date"
				name="to"
				aria-label="Tanggal akhir"
				value={period.to ?? ''}
				class="field mt-1 !py-1.5 !text-xs"
			/>

			<button type="submit" class="btn-primary mt-3 w-full !py-1.5 !text-xs">Terapkan</button>
		</form>
	</details>

	{#if !period.isAllTime && activeKey !== 'custom'}
		<span class="text-[11px] text-ink-500 dark:text-ink-400">{period.label}</span>
	{/if}
</div>
