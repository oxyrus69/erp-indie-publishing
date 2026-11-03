<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatDate, formatIDR } from '$lib/ui';
	import { ArrowRight, Check, PenLine, Plus, Search, X } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	let adding = $state(false);
	let editing = $state<string | null>(null);

	const editTarget = $derived(editing ? (data.authors.find((a) => a.id === editing) ?? null) : null);

	const createSubmit = forms.make({
		key: 'create-author',
		successTitle: 'Penulis ditambahkan',
		errorTitle: 'Gagal menambah penulis',
		onSuccess: () => (adding = false)
	});

	const updateSubmit = forms.make({
		key: 'update-author',
		successTitle: 'Penulis diperbarui',
		errorTitle: 'Gagal memperbarui'
	});

	const toggleSubmit = forms.make({
		key: 'toggle-author',
		successTitle: 'Status portal diperbarui',
		errorTitle: 'Gagal mengubah status'
	});
</script>

<svelte:head><title>Direktori Penulis · ERP Penerbitan</title></svelte:head>

<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Pemilik Karya</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Direktori Penulis</h1>
			<p class="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">
				Akun penulis yang bisa dikontrak. Tanpa penulis aktif, order tidak bisa dibuat.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a href="/orders" class="btn-secondary">Order <ArrowRight class="size-4" /></a>
			<button type="button" class="btn-primary" onclick={() => (adding = !adding)}>
				{#if adding}<X class="size-4" /> Tutup{:else}<Plus class="size-4" /> Tambah penulis{/if}
			</button>
		</div>
	</div>
</header>

<!-- ═════════════ FORM TAMBAH ═════════════ -->
{#if adding}
	<section class="card mb-5">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Penulis Baru</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Portal langsung aktif. Penulis masuk memakai email ini.
				</p>
			</div>
			<PenLine class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		<form method="POST" action="?/create" use:enhance={createSubmit} data-action="create-author" class="space-y-3 px-5 py-4">
			<div class="grid gap-3 sm:grid-cols-3">
				<label class="block">
					<span class="label">Nama Lengkap</span>
					<input name="fullName" class="field mt-1" required minlength="3" maxlength="160" placeholder="Nama sesuai KTP" aria-label="Nama lengkap penulis" />
				</label>
				<label class="block">
					<span class="label">Email</span>
					<input name="email" type="email" class="field mt-1" required maxlength="320" placeholder="nama@email.com" aria-label="Email penulis" />
				</label>
				<label class="block">
					<span class="label">Telepon</span>
					<input name="phone" class="field mt-1" maxlength="32" placeholder="08…" aria-label="Nomor telepon" />
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton class="btn-primary" busy={forms.isBusy('create-author')} busyLabel="Menyimpan…">
					<Plus class="size-4" /> Tambahkan
				</SubmitButton>
				<button type="button" class="btn-secondary" onclick={() => (adding = false)}>Batal</button>
			</div>
		</form>
	</section>
{/if}

<!-- ═════════════ FORM UBAH ═════════════ -->
{#if editTarget}
	<section class="card mb-5">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Ubah {editTarget.fullName}</h2>
			</div>
			<button
				type="button"
				class="text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200"
				aria-label="Tutup form ubah"
				onclick={() => (editing = null)}
			>
				<X class="size-4" />
			</button>
		</div>

		<form method="POST" action="?/update" use:enhance={updateSubmit} data-action="update-author" class="space-y-3 px-5 py-4">
			<input type="hidden" name="id" value={editTarget.id} />
			<div class="grid gap-3 sm:grid-cols-3">
				<label class="block">
					<span class="label">Nama Lengkap</span>
					<input name="fullName" class="field mt-1" required minlength="3" maxlength="160" value={editTarget.fullName} aria-label="Nama lengkap" />
				</label>
				<label class="block">
					<span class="label">Telepon</span>
					<input name="phone" class="field mt-1" maxlength="32" value={editTarget.phone ?? ''} aria-label="Nomor telepon" />
				</label>
				<label class="flex items-end gap-2 pb-2 text-xs">
					<input type="checkbox" name="isActive" checked={editTarget.isActive} class="size-3.5 rounded border-ink-300 dark:border-ink-600" />
					Portal aktif
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton class="btn-primary" busy={forms.isBusy('update-author')} busyLabel="Menyimpan…">
					Simpan perubahan
				</SubmitButton>
				<button type="button" class="btn-secondary" onclick={() => (editing = null)}>Batal</button>
			</div>
		</form>
	</section>
{/if}

<form method="GET" action="/admin/penulis" class="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Cari penulis">
	<div class="relative min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-64">
		<Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" strokeWidth={1.75} />
		<input
			type="search"
			name="q"
			value={data.filter.q}
			placeholder="Cari nama atau email…"
			aria-label="Cari penulis"
			class="field w-full !py-1.5 !pl-8 !text-xs"
		/>
	</div>
	<button type="submit" class="btn-secondary !py-1.5 !text-xs">Terapkan</button>
	{#if data.filter.q}
		<a href="/admin/penulis" class="text-xs text-ink-500 underline-offset-4 hover:underline dark:text-ink-400">Hapus filter</a>
	{/if}
</form>

<section class="card overflow-hidden">
	<div class="card-header">
		<div>
			<h2 class="text-sm font-semibold">{data.authors.length} penulis</h2>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
				{data.authors.filter((a) => a.isActive).length} portal aktif
			</p>
		</div>
		<PenLine class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
	</div>

	{#if data.authors.length === 0}
		<div class="flex flex-col items-center gap-2 px-5 py-16 text-center">
			<PenLine class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			<p class="text-sm font-medium">Tidak ada penulis</p>
			<p class="max-w-sm text-xs text-ink-500 dark:text-ink-400">
				{data.filter.q ? 'Tidak ada yang cocok dengan pencarian ini.' : 'Tambahkan penulis agar order bisa dibuat.'}
			</p>
			{#if !data.filter.q}
				<button type="button" class="btn-primary mt-2" onclick={() => (adding = true)}>
					<Plus class="size-4" /> Tambah penulis
				</button>
			{/if}
		</div>
	{:else}
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.authors as person (person.id)}
				<li class="px-5 py-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<span class="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 font-mono text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
								{person.fullName.slice(0, 1).toUpperCase()}
							</span>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<a
										href={`/admin/penulis/${person.id}`}
										class="text-sm font-medium text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
									>
										{person.fullName}
									</a>
									{#if !person.isActive}
										<span class="badge border-amber-200 bg-amber-50 text-[9px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">Portal nonaktif</span>
									{/if}
								</div>
								<p class="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
									{person.email}{person.phone ? ` · ${person.phone}` : ''}
								</p>
								<p class="mt-1 text-[11px] text-ink-400">
									{person.orderCount} order · {person.bookCount} judul · bergabung {formatDate(person.createdAt)}
								</p>
							</div>
						</div>

						<div class="flex shrink-0 flex-col items-end gap-1">
							<p class="font-mono text-xs tabular-nums">{formatIDR(person.contractValue)}</p>
							<p class="text-[10px] text-ink-400">nilai kontrak</p>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
									onclick={() => (editing = editing === person.id ? null : person.id)}
								>
									Ubah
								</button>
								<form method="POST" action="?/update" use:enhance={toggleSubmit} data-action="toggle-author">
									<input type="hidden" name="id" value={person.id} />
									<input type="hidden" name="fullName" value={person.fullName} />
									<input type="hidden" name="phone" value={person.phone ?? ''} />
									{#if person.isActive}
										<button type="submit" class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400" disabled={forms.isBusy('toggle-author')}>
											Nonaktifkan
										</button>
									{:else}
										<input type="hidden" name="isActive" value="on" />
										<button type="submit" class="inline-flex items-center gap-1 text-[11px] text-yale-700 underline-offset-4 hover:underline dark:text-yale-300" disabled={forms.isBusy('toggle-author')}>
											<Check class="size-3" /> Aktifkan
										</button>
									{/if}
								</form>
							</div>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
