<script lang="ts">
	import { formatIDR } from '$lib/ui';
	import type { AgingBucket } from '$lib/server/services/analytics';

	/**
	 * Piutang menua (aging).
	 *
	 * Sengaja **bukan** grafik. Empat angka dengan satu pesan ("berapa yang
	 * sudah lama macet") lebih cepat dibaca sebagai batang bertumpuk satu
	 * baris daripada empat potong kue: mata langsung membandingkan panjang, dan
	 * totalnya terlihat sebagai keseluruhan yang sama.
	 *
	 * Warna mengikuti tingkat bahaya, bukan kategori: makin tua makin gelap.
	 */
	let { buckets }: { buckets: AgingBucket[] } = $props();

	const total = $derived(buckets.reduce((acc, b) => acc + b.value, 0));
	const totalCount = $derived(buckets.reduce((acc, b) => acc + b.count, 0));

	/** Bagian tiap ember dari total; nol bila tidak ada piutang. */
	function pct(value: number): number {
		return total > 0 ? (value / total) * 100 : 0;
	}

	const SEVERITY: Record<string, { bar: string; dot: string; text: string }> = {
		b0_30: {
			bar: 'bg-yale-600 dark:bg-yale-500',
			dot: 'bg-yale-600 dark:bg-yale-500',
			text: 'text-ink-700 dark:text-ink-200'
		},
		b31_60: {
			bar: 'bg-amber-500 dark:bg-amber-400',
			dot: 'bg-amber-500 dark:bg-amber-400',
			text: 'text-amber-700 dark:text-amber-300'
		},
		b61_90: {
			bar: 'bg-orange-600 dark:bg-orange-500',
			dot: 'bg-orange-600 dark:bg-orange-500',
			text: 'text-orange-700 dark:text-orange-300'
		},
		b90_plus: {
			bar: 'bg-red-600 dark:bg-red-500',
			dot: 'bg-red-600 dark:bg-red-500',
			text: 'text-red-700 dark:text-red-300'
		}
	};
</script>

<figure class="m-0">
	<figcaption class="mb-3">
		<h2 class="text-sm font-semibold">Piutang Menua</h2>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Umur tagihan dihitung dari jatuh tempo. Makin kanan, makin lama macet.
		</p>
	</figcaption>

	{#if total === 0}
		<div
			class="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 text-center dark:border-ink-700"
		>
			<p class="text-sm font-medium">Tidak ada piutang</p>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Semua tagihan sudah lunas.</p>
		</div>
	{:else}
		<p class="mb-3 font-mono text-base leading-tight tabular-nums sm:text-lg">{formatIDR(total)}</p>

		<!-- Satu batang bertumpuk: perbandingan panjang langsung terbaca. -->
		<div
			class="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"
			role="img"
			aria-label={`Piutang ${formatIDR(total)} dari ${totalCount} invoice`}
		>
			{#each buckets as bucket (bucket.key)}
				{#if bucket.value > 0}
					<div
						class="{SEVERITY[bucket.key]?.bar ?? 'bg-ink-400'}"
						style="width: {pct(bucket.value)}%"
					></div>
				{/if}
			{/each}
		</div>

		<dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-4">
			{#each buckets as bucket (bucket.key)}
				<div class="min-w-0">
					<dt class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-500">
						<span class="size-1.5 shrink-0 rounded-full {SEVERITY[bucket.key]?.dot ?? 'bg-ink-400'}"></span>
						<span class="truncate">{bucket.label}</span>
					</dt>
					<dd
						class="mt-1 font-mono text-xs leading-tight tabular-nums {SEVERITY[bucket.key]?.text ?? ''}"
					>
						{formatIDR(bucket.value)}
					</dd>
					<dd class="text-[10px] leading-tight text-ink-400">
						{bucket.count} invoice · {Math.round(pct(bucket.value))}%
					</dd>
				</div>
			{/each}
		</dl>
	{/if}
</figure>
