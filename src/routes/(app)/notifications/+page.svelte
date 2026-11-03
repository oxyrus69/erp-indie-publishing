<script lang="ts">
	import { enhance } from '$app/forms';
	import { Bell, CheckCheck } from 'lucide-svelte';
	import { formatDateTime } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SEVERITY_TONE: Record<string, string> = {
		danger: 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30',
		warning: 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
		success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30',
		info: 'border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-800'
	};

	const CATEGORY_LABEL: Record<string, string> = {
		invoice_due: 'Jatuh tempo',
		invoice_overdue: 'Lewat jatuh tempo',
		task_overdue: 'Task lewat tenggat',
		task_review: 'Menunggu review',
		withdrawal_pending: 'Penarikan',
		comment: 'Komentar'
	};

	const unread = $derived(data.items.filter((item) => !item.readAt).length);
</script>

<svelte:head><title>Notifikasi · ERP Penerbitan</title></svelte:head>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Pusat Peringatan</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Notifikasi</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				{unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}
				· dibuat otomatis dari kondisi nyata, bukan dihitung ulang tiap muat.
			</p>
		</div>

		{#if unread > 0}
			<form method="POST" action="?/read-all" use:enhance>
				<button type="submit" class="btn-secondary">
					<CheckCheck class="size-4" /> Tandai semua dibaca
				</button>
			</form>
		{/if}
	</div>
</header>

{#if data.items.length === 0}
	<section class="card flex flex-col items-center gap-2 px-5 py-16 text-center">
		<Bell class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		<p class="text-sm font-medium">Belum ada notifikasi</p>
		<p class="max-w-sm text-xs text-ink-500 dark:text-ink-400">
			Peringatan invoice jatuh tempo, task lewat tenggat, penarikan yang menunggu, dan hasil
			yang perlu direview akan muncul di sini.
		</p>
	</section>
{:else}
	<section class="card overflow-hidden">
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.items as item (item.id)}
				<li class={item.readAt ? '' : 'bg-yale-50/40 dark:bg-yale-950/20'}>
					<div class="px-5 py-4">
						<!--
							Label kategori dan tombol aksi berbagi satu baris; judul
							mendapat lebar penuh di bawahnya. Kalau ketiganya sejajar,
							judul terpotong beberapa baris di layar ponsel.
						-->
						<div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
							<span
								class="inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide {SEVERITY_TONE[
									item.severity
								] ?? SEVERITY_TONE.info}"
							>
								{CATEGORY_LABEL[item.category] ?? item.category}
							</span>

							{#if !item.readAt}
								<form method="POST" action="?/read" use:enhance class="shrink-0">
									<input type="hidden" name="id" value={item.id} />
									<button type="submit" class="btn-secondary !px-2 !py-1 !text-[11px]">
										<CheckCheck class="size-3" /> Dibaca
									</button>
								</form>
							{/if}
						</div>

						{#if item.href}
							<a
								href={item.href}
								class="block rounded-sm text-sm font-medium leading-snug text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
							>
								{item.title}
							</a>
						{:else}
							<p class="text-sm font-medium leading-snug">{item.title}</p>
						{/if}
						{#if item.body}
							<p class="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
								{item.body}
							</p>
						{/if}
						<p class="mt-1 text-[10px] text-ink-400">
							{formatDateTime(item.createdAt)}
							{#if item.readAt}· dibaca{/if}
						</p>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
