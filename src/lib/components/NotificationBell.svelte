<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Popover } from 'bits-ui';
	import {
		AlertTriangle,
		Bell,
		CheckCheck,
		CircleDollarSign,
		Clock,
		FileText,
		Wallet
	} from 'lucide-svelte';
	import { formatDateTime } from '$lib/ui';

	/**
	 * Lonceng notifikasi.
	 *
	 * Kenapa `Popover` bits-ui, bukan div yang disembunyikan: popover perlu
	 * fokus terjebak saat terbuka, Esc untuk menutup, dan label ARIA yang benar.
	 * `aria-expanded` + `aria-haspopup` di tombol membuat pembaca layar tahu
	 * ada panel di baliknya — sesuatu yang tidak diberikan `<details>`.
	 *
	 * Angka lencana dibatasi "99+" agar tidak merusak tata letak topbar, dan
	 * disembunyikan dari pembaca layar karena judul tombol sudah menyebut
	 * jumlahnya dalam kalimat.
	 */
	let {
		items = [],
		unread = 0
	}: {
		items: {
			id: string;
			category: string;
			severity: string;
			title: string;
			body: string | null;
			href: string | null;
			readAt: Date | string | null;
			createdAt: Date | string;
		}[];
		unread: number;
	} = $props();

	const ICONS: Record<string, typeof Bell> = {
		invoice_due: Clock,
		invoice_overdue: AlertTriangle,
		task_overdue: Clock,
		task_review: FileText,
		withdrawal_pending: Wallet,
		comment: CircleDollarSign
	};

	const TONES: Record<string, string> = {
		danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
		warning:
			'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
		success:
			'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
		info: 'border-ink-200 bg-ink-50 text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300'
	};

	const badgeLabel = $derived(unread > 99 ? '99+' : String(unread));
	const label = $derived(
		unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi, semua sudah dibaca'
	);

	/** Notifikasi yang sudah dibaca tampil redup agar yang baru menonjol. */
	function isUnread(item: { readAt: Date | string | null }): boolean {
		return item.readAt === null;
	}
</script>

<Popover.Root>
	<Popover.Trigger
		class="relative grid size-9 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800"
		aria-label={label}
		title={label}
	>
		<Bell class="size-4" strokeWidth={1.75} />
		{#if unread > 0}
			<span
				class="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-semibold leading-4 text-white dark:bg-red-500"
				aria-hidden="true"
			>
				{badgeLabel}
			</span>
		{/if}
	</Popover.Trigger>

	<Popover.Content
		class="z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl dark:border-ink-800 dark:bg-ink-900"
		sideOffset={8}
		align="end"
	>
		<div class="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
			<div>
				<p class="text-sm font-semibold">Notifikasi</p>
				<p class="text-[11px] text-ink-500 dark:text-ink-400">
					{unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}
				</p>
			</div>
			{#if unread > 0}
				<form method="POST" action="/notifications?/read-all" use:enhance>
					<button type="submit" class="btn-secondary !px-2 !py-1 !text-[11px]">
						<CheckCheck class="size-3" /> Tandai semua
					</button>
				</form>
			{/if}
		</div>

		{#if items.length === 0}
			<div class="px-4 py-10 text-center">
				<Bell class="mx-auto size-5 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				<p class="mt-2 text-xs font-medium">Tidak ada notifikasi</p>
				<p class="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
					Peringatan jatuh tempo dan review muncul di sini.
				</p>
			</div>
		{:else}
			<ul class="max-h-80 divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
				{#each items as item (item.id)}
					{@const Icon = ICONS[item.category] ?? Bell}
					<li class={isUnread(item) ? 'bg-yale-50/40 dark:bg-yale-950/20' : ''}>
						<div class="flex gap-2.5 px-4 py-3">
							<span
								class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border {TONES[item.severity] ?? TONES.info}"
							>
								<Icon class="size-3" strokeWidth={2} />
							</span>

							<div class="min-w-0 flex-1">
								{#if item.href}
									<a
										href={item.href}
										class="block rounded-sm text-xs font-medium leading-snug hover:underline"
									>
										{item.title}
									</a>
								{:else}
									<p class="text-xs font-medium leading-snug">{item.title}</p>
								{/if}
								{#if item.body}
									<p class="mt-0.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
										{item.body}
									</p>
								{/if}
								<p class="mt-1 text-[10px] text-ink-400">{formatDateTime(item.createdAt)}</p>
							</div>

							{#if isUnread(item)}
								<form method="POST" action="/notifications?/read" use:enhance class="shrink-0">
									<input type="hidden" name="id" value={item.id} />
									<button
										type="submit"
										class="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
										aria-label="Tandai sudah dibaca"
										title="Tandai sudah dibaca"
									>
										<CheckCheck class="size-3.5" />
									</button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>

			<div class="border-t border-ink-100 px-4 py-2.5 dark:border-ink-800">
				<a
					href="/notifications"
					class="text-[11px] font-medium text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
				>
					Buka semua notifikasi
				</a>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
