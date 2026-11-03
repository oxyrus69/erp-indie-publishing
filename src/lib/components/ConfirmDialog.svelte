<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import { AlertTriangle, Loader2 } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * Dialog konfirmasi untuk aksi yang tidak bisa dibatalkan (uang & status
	 * permanen). Memakai AlertDialog bits-ui: Esc dan klik di luar menutup dialog,
	 * tetapi hasilnya selalu "batal" — tidak pernah ada aksi yang jalan diam-diam.
	 *
	 * Isi dialog menyebut objek yang terdampak (nomor invoice, nominal) beserta
	 * konsekuensinya, bukan sekadar "Yakin?".
	 */
	let {
		open,
		onOpenChange,
		title,
		confirmLabel = 'Lanjutkan',
		cancelLabel = 'Batal',
		tone = 'primary',
		busy = false,
		error = null,
		children,
		onConfirm
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		title: string;
		confirmLabel?: string;
		cancelLabel?: string;
		tone?: 'primary' | 'danger';
		busy?: boolean;
		error?: string | null;
		children: Snippet;
		onConfirm: () => void;
	} = $props();
</script>

<AlertDialog.Root {open} {onOpenChange}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="fixed inset-0 z-50 bg-ink-950/45 backdrop-blur-[2px]" />
		<AlertDialog.Content
			class="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-ink-200 bg-white p-5 shadow-xl shadow-ink-950/10 focus:outline-none dark:border-ink-700 dark:bg-ink-900 sm:p-6"
		>
			<div class="flex items-start gap-3">
				<span
					class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full {tone === 'danger'
						? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
						: 'bg-yale-50 text-yale-700 dark:bg-yale-950/50 dark:text-yale-300'}"
				>
					<AlertTriangle class="size-4" strokeWidth={2} />
				</span>
				<div class="min-w-0 flex-1">
					<AlertDialog.Title class="text-base font-semibold leading-snug">
						{title}
					</AlertDialog.Title>
					<AlertDialog.Description
						class="mt-3 block space-y-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300"
					>
						{@render children()}
					</AlertDialog.Description>
				</div>
			</div>

			{#if error}
				<p
					class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					role="alert"
				>
					{error}
				</p>
			{/if}

			<div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<AlertDialog.Cancel type="button" class="btn-secondary justify-center" disabled={busy}>
					{cancelLabel}
				</AlertDialog.Cancel>
				<button
					type="button"
					class="{tone === 'danger' ? 'btn-danger' : 'btn-primary'} justify-center"
					disabled={busy}
					aria-busy={busy ? 'true' : undefined}
					onclick={onConfirm}
				>
					{#if busy}
						<Loader2 class="size-4 animate-spin" />
						Memproses…
					{:else}
						{confirmLabel}
					{/if}
				</button>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
