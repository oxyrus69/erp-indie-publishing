<script lang="ts">
	import type { FunnelStep } from '$lib/server/services/analytics';

	/**
	 * Funnel kontrak: DP → Pelunasan → Cetak → Terbit.
	 *
	 * Dibangun dari CSS, bukan pustaka grafik: funnel pada dasarnya empat bar
	 * horizontal dengan lebar proporsional. SVG hanya menambah komponen tanpa
	 * menambah informasi — dan angka di dalam batang tetap terbaca screen
	 * reader karena berupa teks, bukan `<path>`.
	 *
	 * Persentase dihitung terhadap **seluruh order**, bukan tahap sebelumnya.
	 * Funnel ini tidak selalu menurun berurutan (ada order yang sudah cetak
	 * meski pelunasan belum masuk), jadi "lanjut dari tahap sebelumnya" bisa
	 * menghasilkan angka di atas 100% yang membingungkan.
	 */
	let { steps, total }: { steps: FunnelStep[]; total: number } = $props();

	const max = $derived(Math.max(...steps.map((s) => s.value), 1));

	function share(value: number): number {
		return total > 0 ? Math.round((value / total) * 100) : 0;
	}

	const STAGE_TONE = [
		'bg-yale-400 dark:bg-yale-500',
		'bg-yale-500 dark:bg-yale-400',
		'bg-yale-600 dark:bg-yale-500',
		'bg-yale-700 dark:bg-yale-300'
	];
</script>

<figure class="m-0">
	<figcaption class="mb-3">
		<h2 class="text-sm font-semibold">Funnel Kontrak</h2>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{total} order aktif. Persentase menunjukkan porsi yang sudah mencapai tahap itu.
		</p>
	</figcaption>

	{#if total === 0}
		<div
			class="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 text-center dark:border-ink-700"
		>
			<p class="text-sm font-medium">Belum ada order</p>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
				Funnel terisi setelah order pertama dibuat.
			</p>
		</div>
	{:else}
		<ol class="space-y-2.5">
			{#each steps as step, index (step.key)}
				{@const width = (step.value / max) * 100}
				<li>
					<div class="mb-1 flex items-baseline justify-between gap-2">
						<p class="text-xs font-medium">{step.label}</p>
						<p class="font-mono text-xs tabular-nums">
							{step.value}
							<span class="ml-1.5 text-[10px] text-ink-400">({share(step.value)}%)</span>
						</p>
					</div>
					<div class="h-6 w-full overflow-hidden rounded bg-ink-100 dark:bg-ink-800">
						<div
							class="h-full rounded {STAGE_TONE[index] ?? 'bg-yale-600'}"
							style="width: {Math.max(width, step.value > 0 ? 3 : 0)}%"
						></div>
					</div>
					<p class="mt-0.5 text-[10px] text-ink-400">{step.hint}</p>
				</li>
			{/each}
		</ol>
	{/if}
</figure>
