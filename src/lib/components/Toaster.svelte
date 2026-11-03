<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { tick } from 'svelte';
	import { AlertCircle, CheckCircle2, Info, X } from 'lucide-svelte';
	import { toasts, dismissToast, pauseToast, resumeToast } from '$lib/client/toast.svelte';

	/**
	 * Wilayah live yang selalu ada di DOM. Kalau container ini dibuat hanya saat
	 * ada toast, pembaca layar sering tidak mengumumkan isinya karena region
	 * baru muncul bersamaan dengan pesannya.
	 */
	const ICON = {
		success: CheckCircle2,
		error: AlertCircle,
		info: Info
	} as const;

	const TONE = {
		success: 'border-emerald-200 bg-white text-ink-900 dark:border-emerald-900/60 dark:bg-ink-900 dark:text-ink-100',
		error: 'border-red-200 bg-white text-ink-900 dark:border-red-900/60 dark:bg-ink-900 dark:text-ink-100',
		info: 'border-ink-200 bg-white text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100'
	} as const;

	const ICON_TONE = {
		success: 'text-emerald-600 dark:text-emerald-400',
		error: 'text-red-600 dark:text-red-400',
		info: 'text-yale-700 dark:text-yale-300'
	} as const;

	/*
	 * Fokus ke pesan kegagalan.
	 *
	 * Setelah submit gagal, fokus keyboard sering tertinggal di tombol yang
	 * sudah tidak ada — pengguna keyboard lalu harus mencari dari awal. Toast
	 * gagal dibuat fokusabel dan langsung difokuskan supaya pesannya dibacakan
	 * dan Tab berikutnya melanjutkan dari sana.
	 *
	 * Hanya kegagalan yang merebut fokus: pesan sukses tidak boleh memindahkan
	 * kursor pengguna yang sedang bekerja.
	 */
	let lastFocusedError = 0;

	$effect(() => {
		const errorToast = toasts.items.find((toast) => toast.tone === 'error');
		if (!errorToast || errorToast.id === lastFocusedError) return;
		lastFocusedError = errorToast.id;

		tick().then(() => {
			const node = document.getElementById(`toast-${errorToast.id}`);
			node?.focus();
		});
	});
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:px-6"
	aria-live="polite"
	aria-atomic="false"
	role="status"
>
		{#each toasts.items as toast (toast.id)}
		{@const Icon = ICON[toast.tone]}
		<!--
			Toast kegagalan dibuat fokusabel agar bisa dipindahkan fokusnya secara
			terprogram (lihat `$effect` di atas). Peringatan a11y "noninteractive
			tabIndex" memang disengaja: elemen ini bukan kontrol, hanya titik
			persinggahan fokus untuk membacakan pesan.
		-->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			id={`toast-${toast.id}`}
			class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-3.5 py-3 shadow-lg shadow-ink-950/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 {TONE[
				toast.tone
			]}"
			in:fly={{ y: 12, duration: 180, easing: cubicOut }}
			out:fly={{ y: 8, duration: 140, easing: cubicOut }}
			role={toast.tone === 'error' ? 'alert' : 'group'}
			tabindex={toast.tone === 'error' ? -1 : undefined}
			aria-label={toast.tone === 'error' ? 'Pesan kegagalan' : 'Pesan'}
			onmouseenter={() => pauseToast(toast.id)}
			onmouseleave={() => resumeToast(toast.id)}
			onfocusin={() => pauseToast(toast.id)}
			onfocusout={() => resumeToast(toast.id)}
		>
			<Icon class="mt-0.5 size-4 shrink-0 {ICON_TONE[toast.tone]}" strokeWidth={2} />
			<div class="min-w-0 flex-1">
				<p class="text-sm font-medium leading-snug">{toast.title}</p>
				{#if toast.description}
					<p class="mt-0.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
						{toast.description}
					</p>
				{/if}
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-ink-800 dark:hover:text-ink-200"
				aria-label="Tutup pesan"
				onclick={() => dismissToast(toast.id)}
			>
				<X class="size-3.5" strokeWidth={2} />
			</button>
		</div>
	{/each}
</div>
