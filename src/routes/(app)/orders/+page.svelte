<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';	import { ORDER_STATUS, TONE_CLASS, formatDate, formatIDR, statusOf } from '$lib/ui';
	import { tableHref } from '$lib/table/query';
	import { ArrowRight, Package, Plus, Receipt, X } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	/**
	 * Panel form dibuka lewat tombol — atau langsung bila datang dari konversi
	 * CRM (URL membawa `authorId`). Nilai awalnya dibaca sekali lewat `untrack`
	 * supaya menutup panel tidak langsung terbuka lagi setelah navigasi.
	 */
	let creating = $state(untrack(() => Boolean(data.prefill.authorId)));
	let selectedPackageId = $state(untrack(() => data.prefill.packageId));
	let selectedServices = $state<{ serviceId: string; quantity: number }[]>([]);

	const selectedPackage = $derived(
		data.packages.find((pkg) => pkg.id === selectedPackageId) ?? null
	);

	/** Pratinjau nilai kontrak — staf melihat total sebelum menyimpan. */
	const packagePrice = $derived(selectedPackage?.basePriceNum ?? 0);
	const extrasTotal = $derived(
		selectedServices.reduce((acc, line) => {
			const service = data.services.find((s) => s.id === line.serviceId);
			return acc + (service?.unitPriceNum ?? 0) * line.quantity;
		}, 0)
	);
	const contractTotal = $derived(packagePrice + extrasTotal);
	const downPayment = $derived(
		Math.round((contractTotal * (selectedPackage?.downPaymentPctNum ?? 50)) / 100)
	);
	const finalPayment = $derived(contractTotal - downPayment);

	function toggleService(serviceId: string): void {
		const existing = selectedServices.find((line) => line.serviceId === serviceId);
		selectedServices = existing
			? selectedServices.filter((line) => line.serviceId !== serviceId)
			: [...selectedServices, { serviceId, quantity: 1 }];
	}

	function setQuantity(serviceId: string, quantity: number): void {
		selectedServices = selectedServices.map((line) =>
			line.serviceId === serviceId ? { ...line, quantity: Math.max(1, quantity) } : line
		);
	}

	function resetForm(): void {
		creating = false;
		selectedPackageId = '';
		selectedServices = [];
	}

	const createSubmit = forms.make({
		key: 'create-order',
		successTitle: 'Order dibuat',
		errorTitle: 'Order gagal dibuat',
		onSuccess: () => resetForm()
	});

	const cancelSubmit = forms.make({
		key: 'cancel-order',
		successTitle: 'Order dibatalkan',
		errorTitle: 'Pembatalan gagal',
		confirm: ({ formElement }) => {
			const orderNumber =
				formElement.querySelector<HTMLInputElement>('input[name="orderNumber"]')?.value ?? '';
			return {
				title: `Batalkan order ${orderNumber}?`,
				facts: [
					{ label: 'Order', value: orderNumber },
					{ label: 'Akibat', value: 'Invoice yang belum dibayar ikut dibatalkan' }
				],
				note: 'Tindakan ini tidak bisa diurungkan. Order yang sudah punya pembayaran harus dibatalkan lewat finance.',
				confirmLabel: 'Ya, batalkan',
				tone: 'danger'
			};
		}
	});

	let cancelFor = $state<string | null>(null);
</script>

<svelte:head><title>Order · ERP Penerbitan</title></svelte:head>

<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Pintu Masuk Data</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Order</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				Kontrak penulis: paket, layanan tambahan, lalu dua invoice (DP &amp; pelunasan) dibuat
				otomatis.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a href="/projects" class="btn-secondary">Proyek <ArrowRight class="size-4" /></a>
			<button type="button" class="btn-primary" onclick={() => (creating = !creating)}>
				{#if creating}
					<X class="size-4" /> Tutup
				{:else}
					<Plus class="size-4" /> Buat order
				{/if}
			</button>
		</div>
	</div>
</header>

<!-- ══════════════════════════ KPI ══════════════════════════ -->
<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Total Order</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.totalOrders}</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Menunggu DP</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.awaitingDp}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Produksi belum berjalan</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Produksi</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{data.kpi.inProduction}</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Nilai Kontrak</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.totalValue)}</p>
	</article>
</section>

<!-- ══════════════════════════ FORM BUAT ══════════════════════════ -->
{#if creating}
	<section class="card mb-6 overflow-visible">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Order Baru</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Paket menentukan DP, royalti, dan kuota revisi. Layanan tambahan menambah nilai
					kontrak.
				</p>
			</div>
			<Package class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>

		<form method="POST" action="?/create" use:enhance={createSubmit} data-action="create-order" class="space-y-4 px-5 py-4">
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block">
					<span class="label">Penulis</span>
					<select name="authorId" class="field mt-1" required aria-label="Penulis">
						<option value="">— pilih penulis —</option>
						{#each data.authors as author (author.id)}
							<option value={author.id} selected={data.prefill.authorId === author.id}>
								{author.fullName} · {author.email}
							</option>
						{/each}
					</select>
					{#if data.authors.length === 0}
						<span class="mt-1 block text-[11px] text-amber-700 dark:text-amber-400">
							Belum ada akun penulis aktif. Undang penulis terlebih dahulu.
						</span>
					{/if}
				</label>

				<label class="block">
					<span class="label">Paket</span>
					<select
						name="packageId"
						class="field mt-1"
						required
						aria-label="Paket"
						bind:value={selectedPackageId}
					>
						<option value="">— pilih paket —</option>
						{#each data.packages as pkg (pkg.id)}
							<option value={pkg.id} selected={data.prefill.packageId === pkg.id}>
								{pkg.name} · {formatIDR(pkg.basePriceNum)}
							</option>
						{/each}
					</select>
				</label>

				<label class="block">
					<span class="label">Judul Buku</span>
					<input
						name="bookTitle"
						class="field mt-1"
						required
						minlength="2"
						maxlength="240"
						placeholder="Judul naskah yang dikontrak"
						aria-label="Judul buku"
						value={data.prefill.bookTitle}
					/>
				</label>

				<label class="block">
					<span class="label">Subjudul</span>
					<input
						name="bookSubtitle"
						class="field mt-1"
						maxlength="240"
						placeholder="Opsional"
						aria-label="Subjudul buku"
					/>
				</label>

				<label class="block">
					<span class="label">Jatuh Tempo DP</span>
					<input
						name="dueInDays"
						type="number"
						class="field mt-1 font-mono"
						min="1"
						max="180"
						value="14"
						aria-label="Jatuh tempo DP dalam hari"
					/>
				</label>

				<label class="block">
					<span class="label">Catatan Internal</span>
					<input
						name="notes"
						class="field mt-1"
						placeholder="Kesepakatan khusus, diskon, dsb."
						aria-label="Catatan internal"
					/>
				</label>
			</div>

			<!-- Layanan tambahan: checkbox + kuantitas, harga dari katalog. -->
			{#if data.services.length > 0}
				<fieldset class="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
					<legend class="px-1 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-400">
						Layanan Tambahan
					</legend>
					<ul class="space-y-2">
						{#each data.services as service (service.id)}
							{@const line = selectedServices.find((l) => l.serviceId === service.id)}
							<li class="flex flex-wrap items-center justify-between gap-2">
								<label class="flex min-w-0 flex-1 items-center gap-2 text-xs">
									<input
										type="checkbox"
										name="serviceId"
										value={service.id}
										checked={Boolean(line)}
										onchange={() => toggleService(service.id)}
										class="size-3.5 rounded border-ink-300 dark:border-ink-600"
									/>
									<span class="min-w-0">
										<span class="block truncate font-medium">{service.name}</span>
										<span class="block text-[10px] text-ink-400">
											{formatIDR(service.unitPriceNum)} / {service.unit}
										</span>
									</span>
								</label>

								{#if line}
									<label class="flex items-center gap-1.5">
										<span class="sr-only">Kuantitas {service.name}</span>
										<input
											type="number"
											name="serviceQty"
											min="1"
											max="99"
											value={line.quantity}
											oninput={(event) =>
												setQuantity(service.id, Number(event.currentTarget.value) || 1)}
											class="field !w-16 !py-1 !text-xs"
											aria-label={`Kuantitas ${service.name}`}
										/>
										<span class="text-[10px] text-ink-400">{service.unit}</span>
									</label>
								{/if}
							</li>
						{/each}
					</ul>
				</fieldset>
			{/if}

			<!-- Pratinjau nilai: staf melihat akibat pilihan sebelum menyimpan. -->
			{#if selectedPackage}
				<dl
					class="grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-100 sm:grid-cols-3 dark:border-ink-700 dark:bg-ink-800"
				>
					<div class="bg-white px-3 py-2.5 dark:bg-ink-900">
						<dt class="label">Nilai Kontrak</dt>
						<dd class="mt-1 font-mono text-sm tabular-nums">{formatIDR(contractTotal)}</dd>
					</div>
					<div class="bg-white px-3 py-2.5 dark:bg-ink-900">
						<dt class="label">DP {selectedPackage.downPaymentPctNum}%</dt>
						<dd class="mt-1 font-mono text-sm tabular-nums">{formatIDR(downPayment)}</dd>
					</div>
					<div class="bg-white px-3 py-2.5 dark:bg-ink-900">
						<dt class="label">Pelunasan</dt>
						<dd class="mt-1 font-mono text-sm tabular-nums">{formatIDR(finalPayment)}</dd>
					</div>
				</dl>
				<p class="text-[11px] text-ink-500 dark:text-ink-400">
					Royalti penulis {selectedPackage.authorRoyaltyPct}% · {selectedPackage.freeAuthorCopies}
					eksemplar untuk penulis · revisi cover {data.packages[0] ? '' : ''}mengikuti paket.
				</p>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton
					class="btn-primary"
					busy={forms.isBusy('create-order')}
					busyLabel="Membuat order…"
				>
					<Plus class="size-4" /> Buat order &amp; invoice
				</SubmitButton>
				<button type="button" class="btn-secondary" onclick={resetForm}>Batal</button>
			</div>
		</form>
	</section>
{/if}

<!-- ══════════════════════════ DAFTAR ══════════════════════════ -->
<section class="card overflow-hidden">
	<div class="card-header">
		<div>
			<h2 class="text-sm font-semibold">Semua Order</h2>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
				Menampilkan {data.query.from}–{data.query.to} dari {data.query.total} order.
			</p>
		</div>
		<Receipt class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
	</div>

	{#if data.orders.length === 0}
		<div class="flex flex-col items-center gap-2 px-5 py-16 text-center">
			<Receipt class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			<p class="text-sm font-medium">Belum ada order</p>
			<p class="max-w-sm text-xs text-ink-500 dark:text-ink-400">
				Order adalah dokumen pertama: tanpa order tidak ada invoice, proyek, atau task produksi.
			</p>
			<button type="button" class="btn-primary mt-2" onclick={() => (creating = true)}>
				<Plus class="size-4" /> Buat order pertama
			</button>
		</div>
	{:else}
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.orders as order (order.id)}
				<li class="px-5 py-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<StatusBadge {...statusOf(ORDER_STATUS, order.status)} />
								<span class="font-mono text-[10px] text-ink-400">{order.orderNumber}</span>
								{#if order.isFullyPaid}
									<span class="badge {TONE_CLASS.done}">Lunas</span>
								{/if}
							</div>
							<p class="mt-1.5 text-sm font-medium">{order.bookTitle ?? 'Tanpa judul'}</p>
							{#if order.bookSubtitle}
								<p class="text-xs text-ink-500 dark:text-ink-400">{order.bookSubtitle}</p>
							{/if}
							<p class="mt-1 text-[11px] text-ink-400">
								{order.authorName} · {order.packageName} · {formatDate(order.createdAt)}
							</p>
						</div>

						<div class="flex shrink-0 flex-col items-end gap-1">
							<p class="font-mono text-sm tabular-nums">{formatIDR(order.totalNum)}</p>
							<p class="text-[10px] text-ink-400">
								{formatIDR(order.paidNum)} terbayar · {order.paidPct}%
							</p>
							{#if order.status === 'AWAITING_DOWN_PAYMENT'}
								<button
									type="button"
									class="text-[11px] text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
									onclick={() => (cancelFor = cancelFor === order.id ? null : order.id)}
								>
									Batalkan…
								</button>
							{/if}
						</div>
					</div>

					{#if cancelFor === order.id}
						<form
							method="POST"
							action="?/cancel"
							use:enhance={cancelSubmit}
							data-action="cancel-order"
							class="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900/50 dark:bg-red-950/20"
						>
							<input type="hidden" name="orderId" value={order.id} />
							<input type="hidden" name="orderNumber" value={order.orderNumber} />
							<label class="block">
								<span class="label">Alasan pembatalan</span>
								<input
									name="reason"
									class="field mt-1"
									required
									minlength="5"
									maxlength="300"
									placeholder="Contoh: kontrak batal, penulis mengundurkan diri."
									aria-label="Alasan pembatalan"
								/>
							</label>
							<div class="flex items-center gap-2">
								<SubmitButton
									class="btn-secondary !border-red-300 !py-1.5 !text-xs !text-red-700 dark:!border-red-800 dark:!text-red-300"
									busy={forms.isBusy('cancel-order')}
									busyLabel="Membatalkan…"
								>
									Batalkan order
								</SubmitButton>
								<button
									type="button"
									class="btn-secondary !py-1.5 !text-xs"
									onclick={() => (cancelFor = null)}
								>
									Jangan
								</button>
							</div>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.query.totalPages > 1}
		<div class="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 dark:border-ink-800">
			{#if data.query.page > 1}
				<a href={tableHref('/orders', data.query, { page: data.query.page - 1 })} class="link text-xs">
					← Sebelumnya
				</a>
			{:else}
				<span></span>
			{/if}
			<p class="text-[11px] text-ink-400">Halaman {data.query.page} dari {data.query.totalPages}</p>
			{#if data.query.page < data.query.totalPages}
				<a href={tableHref('/orders', data.query, { page: data.query.page + 1 })} class="link text-xs">
					Berikutnya →
				</a>
			{:else}
				<span></span>
			{/if}
		</div>
	{/if}
</section>
