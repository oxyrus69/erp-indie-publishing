<script lang="ts">
	import { ArrowLeft, ArrowRight } from 'lucide-svelte';

	/**
	 * Navigasi halaman + ringkasan hasil.
	 *
	 * Ringkasan ("Menampilkan 1–25 dari 63 invoice") ada di `role="status"`, jadi
	 * pembaca layar mendengar hasil filter berubah tanpa harus menjelajah tabel.
	 * Navigasi tetap tautan biasa supaya bisa di-bookmark dan bekerja tanpa JS.
	 */
	let {
		from,
		to,
		total,
		page,
		totalPages,
		href,
		noun = 'baris'
	}: {
		from: number;
		to: number;
		total: number;
		page: number;
		totalPages: number;
		href: (page: number) => string;
		noun?: string;
	} = $props();

	const summary = $derived(
		total === 0
			? `Tidak ada ${noun} yang cocok.`
			: `Menampilkan ${from}–${to} dari ${total} ${noun}.`
	);
</script>

<div
	class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 dark:border-ink-800"
>
	<p class="text-[11px] text-ink-500 dark:text-ink-400" role="status" aria-live="polite">
		{summary}
	</p>

	{#if totalPages > 1}
		<nav class="flex items-center gap-1" aria-label="Navigasi halaman">
			{#if page > 1}
				<a href={href(page - 1)} class="btn-secondary !px-2 !py-1 !text-[11px]" rel="prev">
					<ArrowLeft class="size-3" /> Sebelumnya
				</a>
			{:else}
				<span class="btn-secondary pointer-events-none !px-2 !py-1 !text-[11px] opacity-40">
					<ArrowLeft class="size-3" /> Sebelumnya
				</span>
			{/if}

			<p class="px-1 font-mono text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
				{page} / {totalPages}
			</p>

			{#if page < totalPages}
				<a href={href(page + 1)} class="btn-secondary !px-2 !py-1 !text-[11px]" rel="next">
					Berikutnya <ArrowRight class="size-3" />
				</a>
			{:else}
				<span class="btn-secondary pointer-events-none !px-2 !py-1 !text-[11px] opacity-40">
					Berikutnya <ArrowRight class="size-3" />
				</span>
			{/if}
		</nav>
	{/if}
</div>
