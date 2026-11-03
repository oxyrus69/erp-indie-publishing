<script lang="ts">
	import { navigating } from '$app/state';
	import { browser } from '$app/environment';

	/**
	 * Bar tipis di bawah topbar untuk setiap navigasi halaman.
	 *
	 * SvelteKit sudah menyediakan `navigating`; tanpa indikator apa pun, klik
	 * terasa mati karena halaman berikutnya baru tampil setelah render server
	 * selesai. Bar ini sengaja tipis dan tanpa teks — cukup tanda klik diterima.
	 *
	 * Bentuk progres: langsung ke 12%, merayap menuju 70% selama menunggu, lalu
	 * penuh dan memudar setelah navigasi selesai.
	 */
	let active = $state(false);
	let progress = $state(0);
	let fading = $state(false);

	/* Variabel biasa (bukan state) untuk penanda internal, agar effect tidak
	 * memicu dirinya sendiri saat menulis state tampilan di atas. */
	let wasBusy = false;
	let timers: ReturnType<typeof setTimeout>[] = [];
	let creep: ReturnType<typeof setInterval> | null = null;

	function clearAll(): void {
		for (const timer of timers) clearTimeout(timer);
		timers = [];
		if (creep) clearInterval(creep);
		creep = null;
	}

	$effect(() => {
		if (!browser) return;
		const busy = navigating.to !== null;

		if (busy && !wasBusy) {
			wasBusy = true;
			clearAll();
			fading = false;
			active = true;
			progress = 12;
			creep = setInterval(() => {
				progress = Math.min(70, progress + (70 - progress) * 0.12);
			}, 220);
			return;
		}

		if (!busy && wasBusy) {
			wasBusy = false;
			clearAll();
			progress = 100;
			timers.push(
				setTimeout(() => {
					fading = true;
					timers.push(
						setTimeout(() => {
							active = false;
							fading = false;
							progress = 0;
						}, 260)
					);
				}, 120)
			);
		}
	});

	$effect(() => () => clearAll());
</script>

<div
	class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity duration-200 {active && !fading
		? 'opacity-100'
		: 'opacity-0'}"
	aria-hidden="true"
>
	<div
		class="h-full origin-left bg-yale-700 transition-[width] duration-200 ease-out dark:bg-yale-400"
		style="width: {progress}%"
	></div>
</div>

{#if active}
	<span class="sr-only" role="status">Memuat halaman…</span>
{/if}
