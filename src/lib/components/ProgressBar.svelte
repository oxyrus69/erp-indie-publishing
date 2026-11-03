<script lang="ts">
	/**
	 * Batang progres yang benar secara semantik.
	 *
	 * Sebelumnya semua progres berupa `<div>` dengan lebar persentase: tidak
	 * terbaca pembaca layar, tidak punya nilai, dan tidak bisa diumumkan.
	 *
	 * Di sini dua hal disediakan sekaligus:
	 *  - `<progress>` asli, yang oleh browser dipetakan ke `role="progressbar"`
	 *    beserta `aria-valuenow/min/max`,
	 *  - label teks yang menyebut persen, karena tidak semua pembaca layar
	 *    mengumumkan nilai `<progress>` tanpa nama.
	 *
	 * Skala selalu 0–100; nilai pemanggil dijepit supaya tidak ada progres
	 * "120%" yang membuat bar melewati wadahnya.
	 */
	let {
		value,
		label,
		showValue = true,
		size = 'sm',
		tone = 'primary',
		class: className = ''
	}: {
		/** 0–100. Nilai di luar rentang dijepit. */
		value: number;
		/** Nama progres, mis. "Pembayaran order". */
		label: string;
		showValue?: boolean;
		size?: 'sm' | 'md';
		tone?: 'primary' | 'done';
		class?: string;
	} = $props();

	const pct = $derived(Math.min(100, Math.max(0, Math.round(value))));

	const BAR_HEIGHT: Record<'sm' | 'md', string> = {
		sm: 'h-1.5',
		md: 'h-2'
	};

	/*
	 * Kelas progres ditulis lengkap, bukan disusun dari variabel: Tailwind
	 * memindai teks sumber, jadi `{color}` yang dirangkai runtime tidak akan
	 * pernah ikut ter-build.
	 */
	const BAR_TONE: Record<'primary' | 'done', string> = {
		primary:
			'[&::-webkit-progress-value]:bg-yale-700 [&::-moz-progress-bar]:bg-yale-700 dark:[&::-webkit-progress-value]:bg-yale-400 dark:[&::-moz-progress-bar]:bg-yale-400',
		done: '[&::-webkit-progress-value]:bg-emerald-600 [&::-moz-progress-bar]:bg-emerald-600 dark:[&::-webkit-progress-value]:bg-emerald-500 dark:[&::-moz-progress-bar]:bg-emerald-500'
	};
</script>

<div class={className}>
	<div class="mb-1 flex items-baseline justify-between gap-2">
		<span class="truncate text-[10px] uppercase tracking-[0.06em] text-ink-400">{label}</span>
		{#if showValue}
			<span class="shrink-0 font-mono text-[10px] tabular-nums text-ink-500 dark:text-ink-400">
				{pct}%
			</span>
		{/if}
	</div>

	<progress
		class="block w-full appearance-none overflow-hidden rounded-full bg-ink-100 {BAR_HEIGHT[
			size
		]} [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full {BAR_TONE[
			tone
		]} dark:bg-ink-800"
		value={pct}
		max="100"
		aria-label={label}
		aria-valuenow={pct}
		aria-valuemin={0}
		aria-valuemax={100}
	></progress>
</div>
