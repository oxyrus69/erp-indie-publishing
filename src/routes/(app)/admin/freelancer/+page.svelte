<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { SPECIALTY_LABEL, formatDate, formatIDR } from '$lib/ui';
	import { ArrowRight, Check, Plus, Search, UserPlus, Users, X } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	let adding = $state(false);
	let editing = $state<string | null>(null);
	let busyToggle = $state<string | null>(null);

	const editTarget = $derived(
		editing ? (data.freelancers.find((f) => f.id === editing) ?? null) : null
	);

	const createSubmit = forms.make({
		key: 'create-freelancer',
		successTitle: 'Freelancer ditambahkan',
		errorTitle: 'Gagal menambah freelancer',
		onSuccess: () => (adding = false)
	});

	const updateSubmit = forms.make({
		key: 'update-freelancer',
		successTitle: 'Freelancer diperbarui',
		errorTitle: 'Gagal memperbarui'
	});

	const toggleSubmit = forms.make({
		key: 'toggle-freelancer',
		successTitle: 'Status diperbarui',
		errorTitle: 'Gagal mengubah status',
		onSuccess: () => (busyToggle = null)
	});
</script>

<svelte:head><title>Direktori Freelancer · ERP Penerbitan</title></svelte:head>

<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Tim Produksi</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Direktori Freelancer</h1>
			<p class="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">
				Editor, proofreader, layouter, dan desainer cover. Hanya freelancer aktif yang muncul di
				form penugasan.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a href="/orders" class="btn-secondary">Order <ArrowRight class="size-4" /></a>
			<button type="button" class="btn-primary" onclick={() => (adding = !adding)}>
				{#if adding}<X class="size-4" /> Tutup{:else}<Plus class="size-4" /> Tambah freelancer{/if}
			</button>
		</div>
	</div>
</header>

<!-- ═════════════ FORM TAMBAH ═════════════ -->
{#if adding}
	<section class="card mb-5">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Freelancer Baru</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Profil langsung aktif dan bisa ditugaskan. Undangan masuk dikirim terpisah.
				</p>
			</div>
			<UserPlus class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		<form method="POST" action="?/create" use:enhance={createSubmit} data-action="create-freelancer" class="space-y-3 px-5 py-4">
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block">
					<span class="label">Nama Lengkap</span>
					<input name="fullName" class="field mt-1" required minlength="3" maxlength="160" placeholder="Nama sesuai rekening" aria-label="Nama lengkap freelancer" />
				</label>
				<label class="block">
					<span class="label">Email</span>
					<input name="email" type="email" class="field mt-1" required maxlength="320" placeholder="nama@email.com" aria-label="Email freelancer" />
				</label>
				<label class="block">
					<span class="label">Keahlian</span>
					<select name="specialty" class="field mt-1" required aria-label="Keahlian freelancer">
						<option value="">— pilih —</option>
						{#each data.specialties as item (item.value)}
							<option value={item.value}>{item.label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Telepon</span>
					<input name="phone" class="field mt-1" maxlength="32" placeholder="08…" aria-label="Nomor telepon" />
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton class="btn-primary" busy={forms.isBusy('create-freelancer')} busyLabel="Menyimpan…">
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

		<form method="POST" action="?/update" use:enhance={updateSubmit} data-action="update-freelancer" class="space-y-3 px-5 py-4">
			<input type="hidden" name="id" value={editTarget.id} />
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block">
					<span class="label">Nama Lengkap</span>
					<input name="fullName" class="field mt-1" required minlength="3" maxlength="160" value={editTarget.fullName} aria-label="Nama lengkap" />
				</label>
				<label class="block">
					<span class="label">Keahlian</span>
					<select name="specialty" class="field mt-1" required aria-label="Keahlian">
						{#each data.specialties as item (item.value)}
							<option value={item.value} selected={editTarget.specialty === item.value}>{item.label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Telepon</span>
					<input name="phone" class="field mt-1" maxlength="32" value={editTarget.phone ?? ''} aria-label="Nomor telepon" />
				</label>
				<label class="flex items-end gap-2 pb-2 text-xs">
					<input type="checkbox" name="isActive" checked={editTarget.isActive} class="size-3.5 rounded border-ink-300 dark:border-ink-600" />
					Aktif dan bisa ditugaskan
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton class="btn-primary" busy={forms.isBusy('update-freelancer')} busyLabel="Menyimpan…">
					Simpan perubahan
				</SubmitButton>
				<button type="button" class="btn-secondary" onclick={() => (editing = null)}>Batal</button>
			</div>
		</form>
	</section>
{/if}

<!-- ═════════════ SARING + DAFTAR ═════════════ -->
<form method="GET" action="/admin/freelancer" class="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Saring direktori freelancer">
	<div class="relative min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-64">
		<Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" strokeWidth={1.75} />
		<input
			type="search"
			name="q"
			value={data.filter.q}
			placeholder="Cari nama atau email…"
			aria-label="Cari freelancer"
			class="field w-full !py-1.5 !pl-8 !text-xs"
		/>
	</div>
	<label class="sr-only" for="specialty-filter">Keahlian</label>
	<select id="specialty-filter" name="specialty" class="field !py-1.5 !pl-2.5 !pr-8 !text-xs" style="width:auto" aria-label="Keahlian">
		<option value="">Keahlian: semua</option>
		{#each data.specialties as item (item.value)}
			<option value={item.value} selected={data.filter.specialty === item.value}>{item.label}</option>
		{/each}
	</select>
	<button type="submit" class="btn-secondary !py-1.5 !text-xs">Terapkan</button>
	{#if data.filter.q || data.filter.specialty}
		<a href="/admin/freelancer" class="text-xs text-ink-500 underline-offset-4 hover:underline dark:text-ink-400">Hapus filter</a>
	{/if}
</form>

<section class="card overflow-hidden">
	<div class="card-header">
		<div>
			<h2 class="text-sm font-semibold">{data.freelancers.length} freelancer</h2>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
				{data.freelancers.filter((f) => f.isActive).length} aktif
			</p>
		</div>
		<Users class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
	</div>

	{#if data.freelancers.length === 0}
		<div class="flex flex-col items-center gap-2 px-5 py-16 text-center">
			<Users class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			<p class="text-sm font-medium">Tidak ada freelancer</p>
			<p class="max-w-sm text-xs text-ink-500 dark:text-ink-400">
				{data.filter.q || data.filter.specialty
					? 'Tidak ada yang cocok dengan filter ini.'
					: 'Tambahkan editor, layouter, atau desainer cover agar task bisa ditugaskan.'}
			</p>
			{#if !data.filter.q && !data.filter.specialty}
				<button type="button" class="btn-primary mt-2" onclick={() => (adding = true)}>
					<Plus class="size-4" /> Tambah freelancer
				</button>
			{/if}
		</div>
	{:else}
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.freelancers as person (person.id)}
				<li class="px-5 py-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<span class="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 font-mono text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
								{person.fullName.slice(0, 1).toUpperCase()}
							</span>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium">{person.fullName}</p>
									<span class="badge border-ink-200 bg-ink-50 text-[9px] text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
										{SPECIALTY_LABEL[person.specialty ?? ''] ?? person.specialty ?? '—'}
									</span>
									{#if !person.isActive}
										<span class="badge border-amber-200 bg-amber-50 text-[9px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">Nonaktif</span>
									{/if}
								</div>
								<p class="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
									{person.email}{person.phone ? ` · ${person.phone}` : ''}
								</p>
								<p class="mt-1 text-[11px] text-ink-400">
									{person.openTasks} dikerjakan · {person.reviewTasks} di review · {person.doneTasks} selesai
									· bergabung {formatDate(person.createdAt)}
								</p>
							</div>
						</div>

						<div class="flex shrink-0 flex-col items-end gap-1">
							<p class="font-mono text-xs tabular-nums">{formatIDR(person.availableNum)}</p>
							<p class="text-[10px] text-ink-400">tersedia · {formatIDR(person.pendingNum)} tertahan</p>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
									onclick={() => (editing = editing === person.id ? null : person.id)}
								>
									Ubah
								</button>
								<form method="POST" action="?/update" use:enhance={toggleSubmit} data-action="toggle-freelancer">
									<input type="hidden" name="id" value={person.id} />
									<input type="hidden" name="fullName" value={person.fullName} />
									<input type="hidden" name="specialty" value={person.specialty ?? ''} />
									<input type="hidden" name="phone" value={person.phone ?? ''} />
									{#if person.isActive}
										<button
											type="submit"
											class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
											disabled={forms.isBusy('toggle-freelancer')}
										>
											Nonaktifkan
										</button>
									{:else}
										<input type="hidden" name="isActive" value="on" />
										<button
											type="submit"
											class="inline-flex items-center gap-1 text-[11px] text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
											disabled={forms.isBusy('toggle-freelancer')}
										>
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
