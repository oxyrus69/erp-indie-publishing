<script lang="ts">
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { confirmState, settleConfirm } from '$lib/client/confirm.svelte';

	/**
	 * Pemasangan tunggal dialog konfirmasi (dirender sekali di AppShell).
	 * `open` diturunkan dari antrean permintaan, jadi menutup dialog lewat Esc
	 * atau klik luar otomatis berarti batal — tidak ada aksi yang jalan diam-diam.
	 */
	const request = $derived(confirmState.current);
</script>

{#if request}
	<ConfirmDialog
		open={true}
		title={request.title}
		confirmLabel={request.confirmLabel}
		cancelLabel={request.cancelLabel ?? 'Batal'}
		tone={request.tone ?? 'primary'}
		onOpenChange={(next) => {
			if (!next) settleConfirm(false);
		}}
		onConfirm={() => settleConfirm(true)}
	>
		{#each request.facts as fact (fact.label)}
			<span class="flex items-baseline justify-between gap-3">
				<span class="text-xs uppercase tracking-[0.06em] text-ink-400">{fact.label}</span>
				<span class="text-right font-mono text-sm tabular-nums text-ink-900 dark:text-ink-100">
					{fact.value}
				</span>
			</span>
		{/each}
		{#if request.note}
			<span class="block pt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
				{request.note}
			</span>
		{/if}
	</ConfirmDialog>
{/if}
