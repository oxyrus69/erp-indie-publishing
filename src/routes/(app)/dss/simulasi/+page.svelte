<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatIDR } from '$lib/ui';
	import { untrack } from 'svelte';
	import { simulatePrice, type PaperType, type BookSize, type BindingType, type LaminationType } from '$lib/printMath';
	import { ArrowLeft, Calculator, Save, Trash2 } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	const PAPER: Record<string, string> = {
		BOOKPAPER: 'Bookpaper',
		HVS: 'HVS',
		ART_PAPER: 'Art paper'
	};
	const SIZE: Record<string, string> = {
		A5: 'A5 (13×19)',
		B5: 'B5 (17,6×25)',
		UNESCO: 'UNESCO (15,5×23)',
		A4: 'A4 (21×29,7)',
		CUSTOM: 'Kustom'
	};
	const BINDING: Record<string, string> = {
		PERFECT_BINDING: 'Perfect binding',
		SPIRAL: 'Spiral',
		HARDCOVER: 'Hardcover',
		STAPLE: 'Staples'
	};
	const LAMINATION: Record<string, string> = {
		NONE: 'Tanpa laminasi',
		DOFF: 'Doff',
		GLOSSY: 'Glossy'
	};

	/** Nilai awal: harga retail rata-rata dari inventori nyata. */
	const first = untrack(() => data.packages[0]);
	let price = $state(untrack(() => data.suggestedPrice));
	let discountPct = $state(0);
	let quantity = $state(300);
	let pageCount = $state(200);
	let paperType = $state<PaperType>('BOOKPAPER');
	let bookSize = $state<BookSize>('B5');
	let binding = $state<BindingType>('PERFECT_BINDING');
	let lamination = $state<LaminationType>('DOFF');
	let isFullColor = $state(false);
	let royaltyPct = $state(first?.authorRoyaltyPctNum ?? 10);

	/** HPP dihitung di klien dengan rumus yang sama dengan mesin ERP. */
	const result = $derived(
		simulatePrice(
			{
				price,
				discountPct,
				royaltyPct,
				quantity,
				pageCount,
				paperType,
				bookSize,
				binding,
				lamination,
				isFullColor
			},
			data.printSettings,
			data.rules.minMarginPct
		)
	);

	/** Perbandingan terhadap harga retail rata-rata yang sudah dipakai. */
	const baseline = $derived(
		simulatePrice(
			{
				price: data.suggestedPrice,
				discountPct: 0,
				royaltyPct,
				quantity,
				pageCount,
				paperType,
				bookSize,
				binding,
				lamination,
				isFullColor
			},
			data.printSettings,
			data.rules.minMarginPct
		)
	);

	const healthy = $derived(result.marginPct >= data.rules.minMarginPct);

	const scenarioInput = $derived(
		JSON.stringify({
			price,
			discountPct,
			royaltyPct,
			quantity,
			pageCount,
			paperType,
			bookSize,
			binding,
			lamination,
			isFullColor
		})
	);

	const saveSubmit = forms.make({
		key: 'save-scenario',
		successTitle: 'Skenario disimpan',
		errorTitle: 'Gagal menyimpan skenario'
	});

	const deleteSubmit = forms.make({
		key: 'delete-scenario',
		successTitle: 'Skenario dihapus',
		errorTitle: 'Gagal menghapus skenario',
		confirm: () => ({
			title: 'Hapus skenario ini?',
			facts: [{ label: 'Akibat', value: 'Hilang dari daftar perbandingan' }],
			note: 'Angka yang sudah dipakai untuk keputusan tetap ada di jejak audit.',
			confirmLabel: 'Ya, hapus',
			tone: 'danger'
		})
	});

	let saving = $state(false);
</script>

<svelte:head><title>Simulasi Harga · DSS · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/dss" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Keputusan
	</a>
	<span aria-hidden="true">/</span>
	<span>Simulasi harga</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">DSS · Simulasi</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Sebelum Dijanjikan</h1>
			<p class="mt-1 max-w-[64ch] text-sm text-ink-500 dark:text-ink-400">
				HPP memakai tarif cetak dan rumus yang sama dengan faktur nyata. Tidak ada perubahan
				katalog dari halaman ini — simulasi menyimpan angka, penerapan tetap di Katalog.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if saving}
				<form method="POST" action="?/save" use:enhance={saveSubmit} data-action="save-scenario" class="flex items-center gap-2">
					<input type="hidden" name="input" value={scenarioInput} />
					<input type="hidden" name="result" value={JSON.stringify(result)} />
					<label class="sr-only" for="scenario-name">Nama skenario</label>
					<input
						id="scenario-name"
						type="text"
						name="name"
						class="field !w-auto min-w-44 !py-1.5 text-xs"
						placeholder="mis. Diskon 15% paket B5"
						required
						minlength="3"
					/>
					<SubmitButton class="btn-primary !py-1.5 text-xs" busy={forms.isBusy('save-scenario')}>
						<Save class="size-3.5" /> Simpan
					</SubmitButton>
					<button type="button" class="text-xs text-ink-500" onclick={() => (saving = false)}>Batal</button>
				</form>
			{:else}
				<button type="button" class="btn-secondary" onclick={() => (saving = true)}>
					<Save class="size-4" /> Simpan skenario
				</button>
			{/if}
		</div>
	</div>
</header>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
	<!-- Parameter -->
	<section class="card" aria-labelledby="judul-parameter">
		<div class="card-header">
			<div>
				<h2 id="judul-parameter" class="text-sm font-semibold">Parameter</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Semua angka berubah langsung; tidak ada tombol hitung.
				</p>
			</div>
			<Calculator class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		<div class="space-y-4 px-5 py-4">
			{#if data.packages.length > 0}
				<label class="block">
					<span class="label">Royalti dari paket</span>
					<select
						class="field mt-1"
						onchange={(event) => {
							const pkg = data.packages.find((row) => row.id === event.currentTarget.value);
							if (pkg) royaltyPct = pkg.authorRoyaltyPctNum;
						}}
					>
						{#each data.packages as pkg (pkg.id)}
							<option value={pkg.id}>{pkg.name} · royalti {pkg.authorRoyaltyPctNum}%</option>
						{/each}
					</select>
					<span class="mt-1 block text-[11px] text-ink-500 dark:text-ink-400">
						Hanya mengambil persentase royalti. Harga kontrak paket bukan harga buku di toko, jadi
						tidak dipakai sebagai harga jual.
					</span>
				</label>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="label">Harga jual buku / eksemplar</span>
					<input
						type="text"
						inputmode="numeric"
						class="field mt-1 text-right font-mono tabular-nums"
						value={price}
						oninput={(event) => (price = Number(event.currentTarget.value.replace(/\D/g, '')) || 0)}
					/>
					<span class="mt-1 block text-[11px] text-ink-500 dark:text-ink-400">
						Rata-rata harga retail yang sudah dipakai: {formatIDR(data.suggestedPrice)}.
					</span>
				</label>
				<label class="block">
					<span class="label">Diskon (%)</span>
					<input
						type="number"
						min="0"
						max="100"
						step="1"
						class="field mt-1 text-right font-mono tabular-nums"
						value={discountPct}
						oninput={(event) => (discountPct = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)))}
					/>
				</label>
				<label class="block">
					<span class="label">Jumlah cetak (eksemplar)</span>
					<input
						type="number"
						min="1"
						step="1"
						class="field mt-1 text-right font-mono tabular-nums"
						value={quantity}
						oninput={(event) => (quantity = Math.max(1, Number(event.currentTarget.value) || 1))}
					/>
				</label>
				<label class="block">
					<span class="label">Jumlah halaman</span>
					<input
						type="number"
						min="1"
						step="1"
						class="field mt-1 text-right font-mono tabular-nums"
						value={pageCount}
						oninput={(event) => (pageCount = Math.max(1, Number(event.currentTarget.value) || 1))}
					/>
				</label>
				<label class="block">
					<span class="label">Kertas</span>
					<select class="field mt-1" value={paperType} onchange={(event) => (paperType = event.currentTarget.value as PaperType)}>
						{#each Object.entries(PAPER) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Ukuran</span>
					<select class="field mt-1" value={bookSize} onchange={(event) => (bookSize = event.currentTarget.value as BookSize)}>
						{#each Object.entries(SIZE) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Jilid</span>
					<select class="field mt-1" value={binding} onchange={(event) => (binding = event.currentTarget.value as BindingType)}>
						{#each Object.entries(BINDING) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Laminasi</span>
					<select class="field mt-1" value={lamination} onchange={(event) => (lamination = event.currentTarget.value as LaminationType)}>
						{#each Object.entries(LAMINATION) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Royalti penulis (%)</span>
					<input
						type="number"
						min="0"
						max="100"
						step="0.5"
						class="field mt-1 text-right font-mono tabular-nums"
						value={royaltyPct}
						oninput={(event) => (royaltyPct = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)))}
					/>
				</label>
				<label class="flex items-end gap-2 pb-2">
					<input
						type="checkbox"
						checked={isFullColor}
						onchange={(event) => (isFullColor = event.currentTarget.checked)}
						class="size-4 rounded border-ink-300 dark:border-ink-600"
					/>
					<span class="text-sm">Cetak full color</span>
				</label>
			</div>
		</div>
	</section>

	<!-- Hasil -->
	<section class="space-y-4" aria-labelledby="judul-hasil">
		<div class="card">
			<div class="card-header">
				<div>
					<h2 id="judul-hasil" class="text-sm font-semibold">Hasil Simulasi</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Ambang margin sehat: {data.rules.minMarginPct}%
					</p>
				</div>
				<span
					class="badge {healthy
						? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
						: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300'}"
				>
					{healthy ? 'Margin sehat' : 'Margin di bawah ambang'}
				</span>
			</div>

			<dl class="divide-y divide-ink-100 dark:divide-ink-800">
				<div class="flex items-baseline justify-between gap-3 px-5 py-3">
					<dt class="text-sm text-ink-600 dark:text-ink-300">HPP cetak / eksemplar</dt>
					<dd class="font-mono text-sm tabular-nums">{formatIDR(result.unitCost)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-3">
					<dt class="text-sm text-ink-600 dark:text-ink-300">Harga bersih setelah diskon</dt>
					<dd class="font-mono text-sm tabular-nums">{formatIDR(result.netPrice)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-3">
					<dt class="text-sm font-medium">Margin / eksemplar</dt>
					<dd class="font-mono text-sm tabular-nums">
						{formatIDR(result.marginPerCopy)}
						<span class="ml-1.5 text-xs text-ink-400">({result.marginPct}%)</span>
					</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-3">
					<dt class="text-sm text-ink-600 dark:text-ink-300">Royalti penulis / eksemplar</dt>
					<dd class="font-mono text-sm tabular-nums">{formatIDR(result.royaltyPerCopy)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-3">
					<dt class="text-sm text-ink-600 dark:text-ink-300">Sisa untuk penerbit / eksemplar</dt>
					<dd class="font-mono text-sm tabular-nums">{formatIDR(result.publisherPerCopy)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-3">
					<dt class="text-sm text-ink-600 dark:text-ink-300">Total margin {quantity} eksemplar</dt>
					<dd class="font-mono text-sm tabular-nums">{formatIDR(result.totalMargin)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-3">
					<dt class="text-sm text-ink-600 dark:text-ink-300">BEP</dt>
					<dd class="font-mono text-sm tabular-nums">
						{result.breakEvenCopies > 0 ? `${result.breakEvenCopies} eksemplar` : 'tidak tercapai'}
					</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 bg-ink-50/60 px-5 py-3 dark:bg-ink-950/30">
					<dt class="text-sm font-medium">Harga minimum untuk margin {data.rules.minMarginPct}%</dt>
					<dd class="font-mono text-sm tabular-nums">{formatIDR(result.minPriceForTarget)}</dd>
				</div>
			</dl>
		</div>

		{#if baseline}
			<section class="card" aria-labelledby="judul-banding">
				<div class="card-header">
					<h2 id="judul-banding" class="text-sm font-semibold">Dibanding Harga Retail Rata-rata</h2>
				</div>
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					<li class="flex items-baseline justify-between gap-3 px-5 py-2.5">
						<span class="text-xs text-ink-500 dark:text-ink-400">Margin / eksemplar</span>
						<span class="font-mono text-xs tabular-nums">
							{formatIDR(result.marginPerCopy)}
							<span class="ml-1 text-ink-400">
								({result.marginPerCopy - baseline.marginPerCopy >= 0 ? '+' : ''}{formatIDR(result.marginPerCopy - baseline.marginPerCopy)})
							</span>
						</span>
					</li>
					<li class="flex items-baseline justify-between gap-3 px-5 py-2.5">
						<span class="text-xs text-ink-500 dark:text-ink-400">Total margin {quantity} eks</span>
						<span class="font-mono text-xs tabular-nums">
							{formatIDR(result.totalMargin)}
							<span class="ml-1 text-ink-400">
								({result.totalMargin - baseline.totalMargin >= 0 ? '+' : ''}{formatIDR(result.totalMargin - baseline.totalMargin)})
							</span>
						</span>
					</li>
				</ul>
			</section>
		{/if}
	</section>
</div>

{#if data.scenarios.length > 0}
	<section class="card mt-6 overflow-hidden" aria-labelledby="judul-tersimpan">
		<div class="card-header">
			<div>
				<h2 id="judul-tersimpan" class="text-sm font-semibold">Skenario Tersimpan</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Angka saat disimpan — tidak ikut berubah ketika tarif cetak berubah.
				</p>
			</div>
		</div>
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.scenarios as scenario (scenario.id)}
				{@const saved = scenario.result as Record<string, number>}
				{@const input = scenario.input as Record<string, number | boolean | string>}
				<li class="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
					<div class="min-w-0">
						<p class="text-sm font-medium">{scenario.name}</p>
						<p class="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
							Harga {formatIDR(Number(input.price ?? 0))}
							{#if Number(input.discountPct ?? 0) > 0}
								· diskon {Number(input.discountPct)}%
							{/if}
							· {Number(input.quantity ?? 0)} eks · {Number(input.pageCount ?? 0)} hlm
						</p>
						<p class="mt-0.5 text-[11px] text-ink-400">
							HPP {formatIDR(Number(saved.unitCost ?? 0))} ·
							margin {Number(saved.marginPct ?? 0)}% ·
							total {formatIDR(Number(saved.totalMargin ?? 0))}
						</p>
					</div>
					<form method="POST" action="?/delete" use:enhance={deleteSubmit} data-action="delete-scenario">
						<input type="hidden" name="id" value={scenario.id} />
						<button
							type="submit"
							class="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-red-700 dark:hover:bg-ink-800 dark:hover:text-red-400"
							aria-label="Hapus skenario {scenario.name}"
							disabled={forms.isBusy('delete-scenario')}
						>
							<Trash2 class="size-3.5" />
						</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>
{/if}
