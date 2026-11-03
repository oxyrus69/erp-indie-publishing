<script lang="ts">
	import { page } from '$app/state';
	import { errorCopy, errorHints, ROLE_HOME_ID } from '$lib/errors';
	import { ROLE_LABEL_ID } from '$lib/ui';
	import { ArrowLeft, ArrowRight, Compass, LockKeyhole, RotateCw, ShieldAlert } from 'lucide-svelte';

	let {
		status,
		message,
		variant = 'full'
	}: {
		status: number;
		message?: string | null;
		/** `full` = halaman penuh (di luar shell), `embedded` = di dalam shell aplikasi. */
		variant?: 'full' | 'embedded';
	} = $props();

	const copy = $derived(errorCopy(status, message));
	const profile = $derived(page.data.profile ?? null);
	const role = $derived<string | null>(profile?.role ?? null);
	const home = $derived(role ? ROLE_HOME_ID[role] : null);
	const hints = $derived(errorHints(status, role));
	const path = $derived(page.url.pathname + page.url.search);

	const Icon = $derived(
		status === 403
			? ShieldAlert
			: status === 404
				? Compass
				: status === 401
					? LockKeyhole
					: RotateCw
	);

	const areaHome = $derived(
		role === 'AUTHOR'
			? 'Portal Penulis'
			: role === 'FREELANCER'
				? 'Ruang Freelancer'
				: 'Dasbor'
	);
</script>

<svelte:head>
	<title>{copy.status} — {copy.title} | Penerbit ERP</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class:min-h-full={variant === 'full'} class="flex flex-col">
	{#if variant === 'full'}
		<header
			class="flex items-center justify-between gap-4 border-b border-ink-200/80 px-6 py-5 dark:border-ink-800 lg:px-10"
		>
			<a
				href={home ?? '/login'}
				class="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100"
			>
				<span class="grid size-6 place-items-center rounded-[6px] bg-yale-700 dark:bg-yale-600">
					<span class="font-serif text-[13px] leading-none text-white">P</span>
				</span>
				<span>Penerbit<span class="text-ink-400">·</span>ERP</span>
			</a>

			{#if role}
				<div class="flex items-center gap-2.5">
					<span class="hidden font-mono text-[11px] text-ink-400 sm:inline"
						>{profile?.email ?? ''}</span
					>					<span
						class="badge border-ink-200 bg-ink-50 text-ink-600 dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-300"
					>
						{ROLE_LABEL_ID[role] ?? role}
					</span>
				</div>
			{:else}
				<a href="/login" class="btn-secondary !py-1.5 !text-xs">Masuk</a>
			{/if}
		</header>
	{/if}

	<main
		class="mx-auto w-full max-w-5xl flex-1 px-6 {variant === 'full'
			? 'py-14 lg:py-20'
			: 'py-10'}"
	>
		<div class="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
			<!-- Angka status: tipografi editorial, bukan ikon besar generik -->
			<div class="min-w-0">
				<p class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-400">
					<Icon class="size-3.5" strokeWidth={1.75} />
					Galat {copy.status}
				</p>

				<p
					class="mt-4 font-serif text-[6.5rem] leading-[0.82] tracking-[-0.04em] text-ink-900 dark:text-ink-50 sm:text-[8.5rem]"
				>
					{copy.status}
				</p>

				<div class="mt-6 flex items-center gap-3">
					<span class="h-px flex-1 bg-ink-200 dark:bg-ink-800"></span>
					<span class="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
						{status === 403 ? 'Ditahan' : status === 404 ? 'Tidak ada' : status === 401 ? 'Sesi' : 'Gagal'}
					</span>
				</div>

				<p
					class="mt-4 break-all rounded-lg border border-ink-200/80 bg-ink-50/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400"
				>
					<span class="text-ink-400 dark:text-ink-500">GET</span>
					{path}
				</p>
			</div>

			<!-- Penjelasan + tindakan -->
			<div class="min-w-0 lg:pt-2">
				<h1 class="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-[1.75rem]">
					{copy.title}
				</h1>

				<p class="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-600 dark:text-ink-300">
					{copy.message}
				</p>

				{#if hints.length}
					<ul class="mt-6 space-y-2.5 border-t border-ink-200/80 pt-5 dark:border-ink-800">
						{#each hints as hint (hint)}
							<li class="flex gap-2.5 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
								<span class="mt-[7px] size-1 shrink-0 rounded-full bg-ink-300 dark:bg-ink-600"></span>
								<span>{hint}</span>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="mt-8 flex flex-wrap items-center gap-2">
					{#if role && home}
						<a href={home} class="btn-primary">
							{status === 403 ? `Buka ${areaHome}` : 'Kembali ke ruang kerja'}
							<ArrowRight class="size-4" />
						</a>
					{:else}
						<a href="/login" class="btn-primary">
							Masuk <ArrowRight class="size-4" />
						</a>
					{/if}

					{#if variant === 'embedded' || status !== 404}
						<button type="button" class="btn-secondary" onclick={() => history.back()}>
							<ArrowLeft class="size-4" /> Halaman sebelumnya
						</button>
					{:else}
						<a href="/" class="btn-secondary"><ArrowLeft class="size-4" /> Beranda</a>
					{/if}
				</div>

				{#if role && status === 403}
					<!-- Akun yang salah peran paling sering jadi penyebab: beri jalan keluar. -->
					<form method="POST" action="/auth/signout" class="mt-3">
						<button
							type="submit"
							class="rounded-sm text-[12px] text-yale-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-yale-300"
						>
							Masuk dengan akun lain
						</button>
					</form>
				{/if}

				{#if variant === 'full'}
					<p class="mt-10 border-t border-ink-200/80 pt-4 text-[12px] leading-relaxed text-ink-400 dark:border-ink-800">
						Merasa ini sebuah kekeliruan? Hubungi admin penerbitan dengan menyebutkan kode
						<span class="font-mono text-ink-500 dark:text-ink-400">{copy.status}</span> dan alamat di atas.
					</p>
				{/if}
			</div>
		</div>
	</main>
</div>
