<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Tombol submit dengan umpan balik tiga lapis: label berubah, spinner
	 * berputar, dan `aria-busy` untuk pembaca layar.
	 *
	 * Penjaga double-submit sesungguhnya ada di handler submit (kunci sinkron),
	 * bukan di `disabled` — atribut ini baru berlaku di render berikutnya, setelah
	 * tap kedua sempat masuk. `disabled` di sini semata umpan balik visual.
	 *
	 * `busyLabel` boleh kosong untuk tombol ikon-saja: spinner tampil tanpa teks
	 * supaya lebar tombol tidak melompat.
	 */
	let {
		busy = false,
		busyLabel = 'Menyimpan…',
		children,
		class: className = 'btn-primary',
		disabled = false,
		...rest
	}: {
		busy?: boolean;
		busyLabel?: string;
		children: Snippet;
		class?: string;
	} & HTMLButtonAttributes = $props();
</script>

<button
	{...rest}
	type={rest.type ?? 'submit'}
	class="{className} justify-center"
	disabled={disabled || busy}
	aria-busy={busy ? 'true' : undefined}
>
	{#if busy}
		<Loader2 class="size-4 shrink-0 animate-spin" />
		{#if busyLabel}<span>{busyLabel}</span>{:else}<span class="sr-only">Memproses…</span>{/if}
	{:else}
		{@render children()}
	{/if}
</button>
