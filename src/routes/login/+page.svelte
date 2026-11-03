<script lang="ts">
	import { enhance } from '$app/forms';
	import { BookOpen, ArrowRight, LoaderCircle } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Masuk — Penerbit ERP</title></svelte:head>

<main class="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
	<!-- Panel editorial kiri -->
	<section class="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-ink-100 lg:flex">
		<div
			class="pointer-events-none absolute inset-0 opacity-[0.06]"
			style="background-image:linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px);background-size:48px 48px"
		></div>
		<div class="relative flex items-center gap-2.5 text-sm font-medium tracking-tight">
			<BookOpen class="size-4" strokeWidth={1.75} />
			<span>Penerbit<span class="text-ink-400">·</span>ERP</span>
		</div>
		<div class="relative max-w-md">
			<p class="font-serif text-[2.75rem] leading-[1.08] tracking-tight">
				Dari naskah mentah<br />menjadi buku<br /><em class="text-ink-300">yang dibaca dunia.</em>
			</p>
			<p class="mt-6 text-sm leading-relaxed text-ink-400">
				Satu sistem untuk produksi naskah, studio cover, perizinan ISBN, cetak, dan royalti —
				transparan bagi penulis, terukur bagi tim.
			</p>
		</div>
		<dl class="relative grid grid-cols-3 gap-6 border-t border-ink-800 pt-6 text-xs">
			<div><dt class="text-ink-500">Track paralel</dt><dd class="mt-1 font-mono text-base text-ink-100">04</dd></div>
			<div><dt class="text-ink-500">Peran pengguna</dt><dd class="mt-1 font-mono text-base text-ink-100">05</dd></div>
			<div><dt class="text-ink-500">Modul ERP</dt><dd class="mt-1 font-mono text-base text-ink-100">06</dd></div>
		</dl>
	</section>

	<!-- Form kanan -->
	<section class="flex items-center justify-center px-6 py-16">
		<div class="w-full max-w-sm">
			<div class="mb-8 lg:hidden">
				<span class="inline-flex items-center gap-2 text-sm font-medium">
					<BookOpen class="size-4" strokeWidth={1.75} /> Penerbit ERP
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight">Masuk ke ruang kerja</h1>
			<p class="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
				Gunakan akun yang terdaftar pada tim penerbitan atau portal penulis.
			</p>

			{#if form?.message}
				<div
					class="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					role="alert"
				>
					{form.message}
				</div>
			{/if}

			{#if data.errorMessage === 'profil-tidak-ditemukan'}
				<div class="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
					Akun Anda belum memiliki profil. Hubungi admin untuk menautkan profil &amp; peran.
				</div>
			{/if}

			<form
				method="POST"
				class="mt-6 space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
				<div>
					<label class="label" for="email">Email</label>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						class="field mt-1.5"
						placeholder="nama@penerbit.co.id"
						value={form?.email ?? ''}
					/>
				</div>
				<div>
					<label class="label" for="password">Kata sandi</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class="field mt-1.5"
						placeholder="••••••••"
					/>
				</div>
				<button type="submit" class="btn-primary w-full" disabled={submitting}>
					{#if submitting}
						<LoaderCircle class="size-4 animate-spin" /> Memproses…
					{:else}
						Masuk <ArrowRight class="size-4" />
					{/if}
				</button>
			</form>

			<p class="mt-8 text-xs leading-relaxed text-ink-400">
				Belum punya akses? Akun penulis dibuat otomatis setelah paket penerbitan dipesan.
				Peran staf diberikan oleh Super Admin.
			</p>

			{#if data.devAuth}
				<div
					class="mt-6 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-[11px] leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400"
				>
					<p class="font-medium uppercase tracking-[0.08em] text-ink-400">Mode pengembangan</p>
					<p class="mt-1">
						Kunci Supabase belum diisi, jadi sesi diverifikasi langsung ke database lokal.
						Masuk dengan salah satu akun demo yang sudah di-seed.
					</p>
				</div>
			{/if}
		</div>
	</section>
</main>
