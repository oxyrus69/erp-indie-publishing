<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import CurrencyInput from '$lib/components/CurrencyInput.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatIDR } from '$lib/ui';
	import { BookOpen, Plus, Tags, Wrench, X } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	const savePackage = forms.make({
		key: 'save-package',
		successTitle: 'Paket disimpan',
		errorTitle: 'Paket gagal disimpan',
		onSuccess: () => (editingPackage = null)
	});
	const saveService = forms.make({
		key: 'save-service',
		successTitle: 'Layanan disimpan',
		errorTitle: 'Layanan gagal disimpan',
		onSuccess: () => (editingService = null)
	});

	const editPackage = forms.make({
		key: 'save-package',
		successTitle: 'Paket disimpan',
		errorTitle: 'Paket gagal disimpan',
		onSuccess: () => (editingPackage = null)
	});
	const editService = forms.make({
		key: 'save-service',
		successTitle: 'Layanan disimpan',
		errorTitle: 'Layanan gagal disimpan',
		onSuccess: () => (editingService = null)
	});

	/** `''` = form kosong (tambah baru); id = sedang mengubah baris itu. */
	let editingPackage = $state<string | null>(null);
	let editingService = $state<string | null>(null);
	let addingPackage = $state(false);
	let addingService = $state(false);

	const packageInEdit = $derived(
		editingPackage ? (data.packages.find((p) => p.id === editingPackage) ?? null) : null
	);
	const serviceInEdit = $derived(
		editingService ? (data.services.find((s) => s.id === editingService) ?? null) : null
	);

	/** Pilihan "termasuk" pada paket; dibaca dari baris yang sedang diubah. */
	type PkgIncludes = PageData['packages'][number];
	const INCLUDES: {
		name: string;
		label: string;
		defaultOn: boolean;
		checked: (pkg: PkgIncludes) => boolean;
	}[] = [
		{ name: 'includesEditing', label: 'Penyuntingan', defaultOn: false, checked: (pkg) => pkg.includesEditing },
		{ name: 'includesLayout', label: 'Tata letak', defaultOn: true, checked: (pkg) => pkg.includesLayout },
		{ name: 'includesCover', label: 'Cover', defaultOn: true, checked: (pkg) => pkg.includesCover },
		{ name: 'includesIsbn', label: 'ISBN', defaultOn: true, checked: (pkg) => pkg.includesIsbn }
	];
</script>

<svelte:head><title>Katalog · ERP Penerbitan</title></svelte:head>

<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Harga &amp; Isi Layanan</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Katalog</h1>
			<p class="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">
				Paket menentukan DP, royalti, dan kuota revisi. Layanan dijual terpisah dan bisa
				ditambahkan saat membuat order.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class="btn-secondary" onclick={() => { addingService = !addingService; editingService = null; }}>
				<Wrench class="size-4" /> Layanan
			</button>
			<button type="button" class="btn-primary" onclick={() => { addingPackage = !addingPackage; editingPackage = null; }}>
				<Plus class="size-4" /> Paket
			</button>
		</div>
	</div>
</header>

<!-- ═════════════ FORM PAKET ═════════════ -->
{#if addingPackage || packageInEdit}
	{@const pkg = packageInEdit}
	<section class="card mb-5">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">{pkg ? `Ubah ${pkg.name}` : 'Paket Baru'}</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Menonaktifkan paket lebih aman daripada menghapus: order lama tetap terbaca.
				</p>
			</div>
			<button
				type="button"
				class="text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200"
				aria-label="Tutup form paket"
				onclick={() => { addingPackage = false; editingPackage = null; }}
			>
				<X class="size-4" />
			</button>
		</div>

		<form
			method="POST"
			action="?/savePackage"
			use:enhance={pkg ? editPackage : savePackage}
			data-action="save-package"
			class="space-y-4 px-5 py-4"
		>
			{#if pkg}<input type="hidden" name="id" value={pkg.id} />{/if}

			<div class="grid gap-3 sm:grid-cols-3">
				<label class="block">
					<span class="label">Kode</span>
					<input name="code" class="field mt-1 font-mono uppercase" required maxlength="48" value={pkg?.code ?? ''} placeholder="PAKET-DASAR" aria-label="Kode paket" />
				</label>
				<label class="block sm:col-span-2">
					<span class="label">Nama</span>
					<input name="name" class="field mt-1" required maxlength="160" value={pkg?.name ?? ''} placeholder="Paket Dasar" aria-label="Nama paket" />
				</label>
			</div>

			<label class="block">
				<span class="label">Tagline</span>
				<input name="tagline" class="field mt-1" maxlength="200" value={pkg?.tagline ?? ''} placeholder="Cetak rapi, terbit resmi" aria-label="Tagline paket" />
			</label>

			<div class="grid gap-3 sm:grid-cols-3">
				<CurrencyInput name="basePrice" label="Harga Paket" value={pkg?.basePriceNum ?? 0} required hint="Nilai kontrak dasar sebelum layanan tambahan." />
				<label class="block">
					<span class="label">DP (%)</span>
					<input name="downPaymentPct" type="number" min="0" max="100" step="1" class="field mt-1 font-mono" value={pkg?.downPaymentPctNum ?? 50} aria-label="Persentase DP" />
				</label>
				<label class="block">
					<span class="label">Royalti Penulis (%)</span>
					<input name="authorRoyaltyPct" type="number" min="0" max="100" step="1" class="field mt-1 font-mono" value={pkg?.authorRoyaltyPctNum ?? 10} aria-label="Persentase royalti" />
				</label>
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				<label class="block">
					<span class="label">Eksemplar Penulis</span>
					<input name="freeAuthorCopies" type="number" min="0" class="field mt-1 font-mono" value={pkg?.freeAuthorCopies ?? 2} aria-label="Eksemplar gratis penulis" />
				</label>
				<label class="block">
					<span class="label">Revisi Cover</span>
					<input name="maxCoverRevisions" type="number" min="0" class="field mt-1 font-mono" value={pkg?.maxCoverRevisions ?? 2} aria-label="Kuota revisi cover" />
				</label>
				<label class="block">
					<span class="label">Revisi Layout</span>
					<input name="maxLayoutRevisions" type="number" min="0" class="field mt-1 font-mono" value={pkg?.maxLayoutRevisions ?? 2} aria-label="Kuota revisi layout" />
				</label>
			</div>

			<fieldset class="flex flex-wrap gap-x-5 gap-y-2">
				<legend class="label mb-1">Termasuk</legend>
				{#each INCLUDES as item (item.name)}
					<label class="flex items-center gap-1.5 text-xs">
						<input
							type="checkbox"
							name={item.name}
							checked={pkg ? item.checked(pkg) : item.defaultOn}
							class="size-3.5 rounded border-ink-300 dark:border-ink-600"
						/>
						{item.label}
					</label>
				{/each}
			</fieldset>

			<label class="flex items-center gap-2 text-xs">
				<input type="checkbox" name="isActive" checked={pkg?.isActive ?? true} class="size-3.5 rounded border-ink-300 dark:border-ink-600" />
				Aktif dan bisa dipilih saat membuat order
			</label>

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton class="btn-primary" busy={forms.isBusy('save-package')} busyLabel="Menyimpan…">
					{pkg ? 'Simpan perubahan' : 'Tambah paket'}
				</SubmitButton>
				<button type="button" class="btn-secondary" onclick={() => { addingPackage = false; editingPackage = null; }}>Batal</button>
			</div>
		</form>
	</section>
{/if}

<!-- ═════════════ FORM LAYANAN ═════════════ -->
{#if addingService || serviceInEdit}
	{@const svc = serviceInEdit}
	<section class="card mb-5">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">{svc ? `Ubah ${svc.name}` : 'Layanan Baru'}</h2>
			</div>
			<button
				type="button"
				class="text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200"
				aria-label="Tutup form layanan"
				onclick={() => { addingService = false; editingService = null; }}
			>
				<X class="size-4" />
			</button>
		</div>

		<form
			method="POST"
			action="?/saveService"
			use:enhance={svc ? editService : saveService}
			data-action="save-service"
			class="space-y-4 px-5 py-4"
		>
			{#if svc}<input type="hidden" name="id" value={svc.id} />{/if}

			<div class="grid gap-3 sm:grid-cols-3">
				<label class="block">
					<span class="label">Kode</span>
					<input name="code" class="field mt-1 font-mono uppercase" required maxlength="48" value={svc?.code ?? ''} placeholder="JASA-EDITING" aria-label="Kode layanan" />
				</label>
				<label class="block sm:col-span-2">
					<span class="label">Nama</span>
					<input name="name" class="field mt-1" required maxlength="160" value={svc?.name ?? ''} placeholder="Jasa Penyuntingan Naskah" aria-label="Nama layanan" />
				</label>
			</div>

			<label class="block">
				<span class="label">Deskripsi</span>
				<input name="description" class="field mt-1" maxlength="300" value={svc?.description ?? ''} aria-label="Deskripsi layanan" />
			</label>

			<div class="grid gap-3 sm:grid-cols-3">
				<CurrencyInput name="unitPrice" label="Harga" value={svc?.unitPriceNum ?? 0} required />
				<label class="block">
					<span class="label">Satuan</span>
					<input name="unit" class="field mt-1" maxlength="32" value={svc?.unit ?? 'paket'} placeholder="naskah" aria-label="Satuan layanan" />
				</label>
				<label class="flex items-end gap-2 pb-2 text-xs">
					<input type="checkbox" name="isActive" checked={svc?.isActive ?? true} class="size-3.5 rounded border-ink-300 dark:border-ink-600" />
					Aktif
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton class="btn-primary" busy={forms.isBusy('save-service')} busyLabel="Menyimpan…">
					{svc ? 'Simpan perubahan' : 'Tambah layanan'}
				</SubmitButton>
				<button type="button" class="btn-secondary" onclick={() => { addingService = false; editingService = null; }}>Batal</button>
			</div>
		</form>
	</section>
{/if}

<div class="grid gap-5 xl:grid-cols-2">
	<!-- ═════════════ PAKET ═════════════ -->
	<section class="card min-w-0">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Paket ({data.packages.length})</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Dipakai saat membuat order.</p>
			</div>
			<BookOpen class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		{#if data.packages.length === 0}
			<p class="px-5 py-10 text-center text-xs text-ink-500 dark:text-ink-400">
				Belum ada paket. Tanpa paket, order tidak bisa dibuat.
			</p>
		{:else}
			<ul class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.packages as pkg (pkg.id)}
					<li class="px-5 py-3.5">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium">{pkg.name}</p>
									<span class="font-mono text-[10px] text-ink-400">{pkg.code}</span>
									{#if !pkg.isActive}
										<span class="badge border-ink-200 bg-ink-50 text-[9px] text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400">Nonaktif</span>
									{/if}
								</div>
								{#if pkg.tagline}
									<p class="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">{pkg.tagline}</p>
								{/if}
								<p class="mt-1 text-[11px] text-ink-400">
									DP {pkg.downPaymentPctNum}% · royalti {pkg.authorRoyaltyPctNum}% · {pkg.freeAuthorCopies} eksemplar
								</p>
							</div>
							<div class="flex shrink-0 flex-col items-end gap-1">
								<p class="font-mono text-sm tabular-nums">{formatIDR(pkg.basePriceNum)}</p>
								<button
									type="button"
									class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
									onclick={() => { editingPackage = pkg.id; addingPackage = false; }}
								>
									Ubah
								</button>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- ═════════════ LAYANAN ═════════════ -->
	<section class="card min-w-0">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Layanan ({data.services.length})</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Ditambahkan ke order sebagai item.</p>
			</div>
			<Tags class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		{#if data.services.length === 0}
			<p class="px-5 py-10 text-center text-xs text-ink-500 dark:text-ink-400">
				Belum ada layanan a-la-carte.
			</p>
		{:else}
			<ul class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.services as svc (svc.id)}
					<li class="px-5 py-3.5">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium">{svc.name}</p>
									<span class="font-mono text-[10px] text-ink-400">{svc.code}</span>
									{#if !svc.isActive}
										<span class="badge border-ink-200 bg-ink-50 text-[9px] text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400">Nonaktif</span>
									{/if}
								</div>
								{#if svc.description}
									<p class="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">{svc.description}</p>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end gap-1">
								<p class="font-mono text-sm tabular-nums">{formatIDR(svc.unitPriceNum)}</p>
								<p class="text-[10px] text-ink-400">per {svc.unit}</p>
								<button
									type="button"
									class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
									onclick={() => { editingService = svc.id; addingService = false; }}
								>
									Ubah
								</button>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
