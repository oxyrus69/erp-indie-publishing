<script lang="ts">
	import { ArrowLeft, Printer } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * Kerangka dokumen cetak.
	 *
	 * Halaman laporan sengaja TIDAK memakai `AppShell`: tanpa sidebar, topbar,
	 * dan toast, dokumennya sudah bersih sejak layar — tidak bergantung pada CSS
	 * cetak untuk menyembunyikan navigasi. `@media print` tetap ada untuk
	 * merapikan tabel, margin kertas, dan memaksa tema terang.
	 *
	 * Tombol "Cetak" memanggil `window.print()`; tanpa JavaScript halaman tetap
	 * terbaca dan bisa dicetak lewat menu peramban.
	 */
	let {
		title,
		subtitle,
		meta = [],
		backHref = '/admin/finance',
		backLabel = 'Kembali ke keuangan',
		children
	}: {
		title: string;
		subtitle?: string;
		meta?: { label: string; value: string }[];
		backHref?: string;
		backLabel?: string;
		children: Snippet;
	} = $props();

	const printedAt = new Intl.DateTimeFormat('id-ID', {
		dateStyle: 'long',
		timeStyle: 'short'
	}).format(new Date());
</script>

<svelte:head><title>{title} · ERP Penerbitan</title></svelte:head>

<div class="min-h-screen bg-paper text-ink-900 dark:bg-ink-950 dark:text-ink-100">
	<!-- Bilah kendali: hilang saat dicetak. -->
	<div
		class="no-print sticky top-0 z-10 border-b border-ink-200/80 bg-paper/90 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-950/90 sm:px-8"
	>
		<div class="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
			<a href={backHref} class="btn-secondary !py-1.5 !text-xs">
				<ArrowLeft class="size-3.5" /> {backLabel}
			</a>
			<button type="button" class="btn-primary !py-1.5 !text-xs" onclick={() => window.print()}>
				<Printer class="size-3.5" /> Cetak / simpan PDF
			</button>
		</div>
	</div>

	<main class="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
		<header class="mb-6 border-b border-ink-200 pb-4 dark:border-ink-800">
			<p class="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400">
				Penerbit · ERP
			</p>
			<h1 class="mt-1 font-serif text-2xl leading-tight tracking-tight sm:text-3xl">{title}</h1>
			{#if subtitle}
				<p class="mt-1 text-sm text-ink-600 dark:text-ink-300">{subtitle}</p>
			{/if}

			<dl class="mt-4 grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
				{#each meta as item (item.label)}
					<div class="flex gap-2">
						<dt class="shrink-0 uppercase tracking-[0.06em] text-ink-400">{item.label}</dt>
						<dd class="font-medium">{item.value}</dd>
					</div>
				{/each}
				<div class="flex gap-2 sm:col-span-2">
					<dt class="shrink-0 uppercase tracking-[0.06em] text-ink-400">Dicetak</dt>
					<dd class="font-medium">{printedAt}</dd>
				</div>
			</dl>
		</header>

		{@render children()}

		<footer class="mt-8 border-t border-ink-200 pt-3 text-[10px] text-ink-400 dark:border-ink-800">
			Dokumen dihasilkan otomatis dari ERP Penerbitan. Angka diambil langsung dari invoice dan
			ledger, bukan salinan manual.
		</footer>
	</main>
</div>
