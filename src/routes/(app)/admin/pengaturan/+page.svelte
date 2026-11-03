<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import CurrencyInput from '$lib/components/CurrencyInput.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatIDR, formatDateTime } from '$lib/ui';
	import { Coins, Gauge, Hash, Landmark, Wallet } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	const savePrint = forms.make({
		key: 'save-print',
		successTitle: 'Tarif cetak disimpan',
		errorTitle: 'Tarif gagal disimpan'
	});
	const saveDocument = forms.make({
		key: 'save-document',
		successTitle: 'Penomoran disimpan',
		errorTitle: 'Penomoran gagal disimpan'
	});
	const saveWithdrawal = forms.make({
		key: 'save-withdrawal',
		successTitle: 'Batas penarikan disimpan',
		errorTitle: 'Batas gagal disimpan'
	});
	const saveDecision = forms.make({
		key: 'save-decision',
		successTitle: 'Ambang keputusan disimpan',
		errorTitle: 'Ambang gagal disimpan'
	});

	/**
	 * Pratinjau hidup: angka berubah saat isian diubah, tanpa menyimpan.
	 * Nilai awal dibaca sekali lewat fungsi, karena form ini tidak dikendalikan
	 * dari luar — perubahan datang dari input pengguna, bukan dari `data` baru.
	 */
	function initialPreview() {
		return {
			paperBookpaper: data.print.paperRatePerPage.BOOKPAPER,
			fullColorMultiplier: data.print.fullColorMultiplier,
			minPages: data.print.minPages,
			vatPct: data.print.vatPct
		};
	}
	let previewState = $state(initialPreview());

	/** Baris pengali ukuran; dipisah dari markup agar tipenya jelas. */
	function sizeFields(): { name: string; label: string; value: number }[] {
		return [
			{ name: 'sizeA5', label: 'A5', value: data.print.sizeMultiplier.A5 },
			{ name: 'sizeB5', label: 'B5', value: data.print.sizeMultiplier.B5 },
			{ name: 'sizeUnesco', label: 'UNESCO', value: data.print.sizeMultiplier.UNESCO },
			{ name: 'sizeA4', label: 'A4', value: data.print.sizeMultiplier.A4 },
			{ name: 'sizeCustom', label: 'Kustom', value: data.print.sizeMultiplier.CUSTOM }
		];
	}
	const SIZE_FIELDS = sizeFields();

	const pages = $derived(Math.max(previewState.minPages, 176));
	const paperAndInk = $derived(Math.round(pages * previewState.paperBookpaper));
	const unit = $derived(paperAndInk + data.print.bindingCost.PERFECT_BINDING + data.print.laminationCost.DOFF);
	const subtotal = $derived(unit * 300);
	const vat = $derived(Math.round((subtotal * previewState.vatPct) / 100));
</script>

<svelte:head><title>Pengaturan · ERP Penerbitan</title></svelte:head>

<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Kebijakan Operasional</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Pengaturan</h1>
			<p class="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">
				Angka di sini dipakai langsung oleh perhitungan HPP, penomoran dokumen, dan batas
				penarikan. Perubahan berlaku pada transaksi berikutnya, bukan yang sudah tercatat.
			</p>
		</div>
	</div>
</header>

<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
	<div class="min-w-0 space-y-5">
		<!-- ═════════════ TARIF CETAK ═════════════ -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Tarif Cetak &amp; PPN</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Per halaman per eksemplar, dalam rupiah. Sebelumnya konstanta di kode.
					</p>
				</div>
				<Coins class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>

			<form method="POST" action="?/savePrint" use:enhance={savePrint} data-action="save-print" class="space-y-5 px-5 py-4">
				<fieldset>
					<legend class="label">Tarif Kertas / Halaman</legend>
					<div class="mt-2 grid gap-3 sm:grid-cols-3">
						<label class="block">
							<span class="label">Bookpaper</span>
							<input
								name="paperBookpaper"
								type="number"
								min="0"
								step="1"
								class="field mt-1 font-mono"
								value={data.print.paperRatePerPage.BOOKPAPER}
								aria-label="Tarif bookpaper per halaman"
								oninput={(e) => (previewState.paperBookpaper = Number(e.currentTarget.value) || 0)}
							/>
						</label>
						<label class="block">
							<span class="label">HVS</span>
							<input
								name="paperHvs"
								type="number"
								min="0"
								step="1"
								class="field mt-1 font-mono"
								value={data.print.paperRatePerPage.HVS}
								aria-label="Tarif HVS per halaman"
							/>
						</label>
						<label class="block">
							<span class="label">Art Paper</span>
							<input
								name="paperArtPaper"
								type="number"
								min="0"
								step="1"
								class="field mt-1 font-mono"
								value={data.print.paperRatePerPage.ART_PAPER}
								aria-label="Tarif art paper per halaman"
							/>
						</label>
					</div>
				</fieldset>

				<fieldset>
					<legend class="label">Pengali Ukuran (terhadap A5)</legend>
					<div class="mt-2 grid gap-3 sm:grid-cols-5">
						{#each SIZE_FIELDS as field (field.name)}
							<label class="block">
								<span class="label">{field.label}</span>
								<input
									name={field.name}
									type="number"
									min="0.1"
									step="0.05"
									class="field mt-1 font-mono"
									value={field.value}
									aria-label={`Pengali ukuran ${field.label}`}
								/>
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset>
					<legend class="label">Biaya Jilid / Eksemplar</legend>
					<div class="mt-2 grid gap-3 sm:grid-cols-4">
						<label class="block">
							<span class="label">Perfect Binding</span>
							<input name="bindPerfect" type="number" min="0" class="field mt-1 font-mono" value={data.print.bindingCost.PERFECT_BINDING} aria-label="Biaya perfect binding" />
						</label>
						<label class="block">
							<span class="label">Spiral</span>
							<input name="bindSpiral" type="number" min="0" class="field mt-1 font-mono" value={data.print.bindingCost.SPIRAL} aria-label="Biaya spiral" />
						</label>
						<label class="block">
							<span class="label">Hardcover</span>
							<input name="bindHardcover" type="number" min="0" class="field mt-1 font-mono" value={data.print.bindingCost.HARDCOVER} aria-label="Biaya hardcover" />
						</label>
						<label class="block">
							<span class="label">Staples</span>
							<input name="bindStaple" type="number" min="0" class="field mt-1 font-mono" value={data.print.bindingCost.STAPLE} aria-label="Biaya staples" />
						</label>
					</div>
				</fieldset>

				<fieldset>
					<legend class="label">Laminasi / Eksemplar</legend>
					<div class="mt-2 grid gap-3 sm:grid-cols-3">
						<label class="block">
							<span class="label">Tanpa</span>
							<input name="lamNone" type="number" min="0" class="field mt-1 font-mono" value={data.print.laminationCost.NONE} aria-label="Biaya tanpa laminasi" />
						</label>
						<label class="block">
							<span class="label">Doff</span>
							<input name="lamDoff" type="number" min="0" class="field mt-1 font-mono" value={data.print.laminationCost.DOFF} aria-label="Biaya laminasi doff" />
						</label>
						<label class="block">
							<span class="label">Glossy</span>
							<input name="lamGlossy" type="number" min="0" class="field mt-1 font-mono" value={data.print.laminationCost.GLOSSY} aria-label="Biaya laminasi glossy" />
						</label>
					</div>
				</fieldset>

				<div class="grid gap-3 sm:grid-cols-3">
					<label class="block">
						<span class="label">Pengali Full Color</span>
						<input
							name="fullColorMultiplier"
							type="number"
							min="1"
							step="0.1"
							class="field mt-1 font-mono"
							value={data.print.fullColorMultiplier}
							aria-label="Pengali full color"
							oninput={(e) => (previewState.fullColorMultiplier = Number(e.currentTarget.value) || 1)}
						/>
					</label>
					<label class="block">
						<span class="label">Minimum Halaman</span>
						<input
							name="minPages"
							type="number"
							min="1"
							step="1"
							class="field mt-1 font-mono"
							value={data.print.minPages}
							aria-label="Minimum halaman cetak"
							oninput={(e) => (previewState.minPages = Number(e.currentTarget.value) || 1)}
						/>
					</label>
					<label class="block">
						<span class="label">PPN (%)</span>
						<input
							name="vatPct"
							type="number"
							min="0"
							max="100"
							step="0.5"
							class="field mt-1 font-mono"
							value={data.print.vatPct}
							aria-label="Persentase PPN"
							oninput={(e) => (previewState.vatPct = Number(e.currentTarget.value) || 0)}
						/>
					</label>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-[11px] text-ink-400">
						Terakhir diubah:
						{data.updatedAt.print ? formatDateTime(data.updatedAt.print) : 'belum pernah'}
					</p>
					<SubmitButton class="btn-primary" busy={forms.isBusy('save-print')} busyLabel="Menyimpan…">
						Simpan tarif cetak
					</SubmitButton>
				</div>
			</form>
		</section>

		<!-- ═════════════ PENOMORAN ═════════════ -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Prefix Penomoran</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Dokumen dibuat sebagai <span class="font-mono">PREFIX-YYYYMM-0001</span>.
					</p>
				</div>
				<Hash class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>

			<form method="POST" action="?/saveDocument" use:enhance={saveDocument} data-action="save-document" class="space-y-4 px-5 py-4">
				<div class="grid gap-3 sm:grid-cols-4">
					<label class="block">
						<span class="label">Invoice</span>
						<input name="invoicePrefix" class="field mt-1 font-mono uppercase" maxlength="6" required value={data.document.invoicePrefix} aria-label="Prefix invoice" />
					</label>
					<label class="block">
						<span class="label">Order</span>
						<input name="orderPrefix" class="field mt-1 font-mono uppercase" maxlength="6" required value={data.document.orderPrefix} aria-label="Prefix order" />
					</label>
					<label class="block">
						<span class="label">Penarikan</span>
						<input name="withdrawalPrefix" class="field mt-1 font-mono uppercase" maxlength="6" required value={data.document.withdrawalPrefix} aria-label="Prefix penarikan" />
					</label>
					<label class="block">
						<span class="label">Penjualan</span>
						<input name="salesPrefix" class="field mt-1 font-mono uppercase" maxlength="6" required value={data.document.salesPrefix} aria-label="Prefix penjualan" />
					</label>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-[11px] text-ink-400">
						Terakhir diubah:
						{data.updatedAt.document ? formatDateTime(data.updatedAt.document) : 'belum pernah'}
					</p>
					<SubmitButton class="btn-primary" busy={forms.isBusy('save-document')} busyLabel="Menyimpan…">
						Simpan penomoran
					</SubmitButton>
				</div>
			</form>
		</section>

		<!-- ═════════════ PENARIKAN ═════════════ -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Batas Penarikan</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Berlaku untuk penarikan komisi freelancer dan royalti penulis.
					</p>
				</div>
				<Wallet class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>

			<form method="POST" action="?/saveWithdrawal" use:enhance={saveWithdrawal} data-action="save-withdrawal" class="space-y-4 px-5 py-4">
				<div class="sm:max-w-xs">
					<CurrencyInput
						name="minimumAmount"
						label="Minimum Penarikan"
						value={data.withdrawal.minimumAmount}
						hint="Nol berarti tanpa batas minimum."
					/>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-[11px] text-ink-400">
						Terakhir diubah:
						{data.updatedAt.withdrawal ? formatDateTime(data.updatedAt.withdrawal) : 'belum pernah'}
					</p>
					<SubmitButton class="btn-primary" busy={forms.isBusy('save-withdrawal')} busyLabel="Menyimpan…">
						Simpan batas
					</SubmitButton>
				</div>
			</form>
		</section>

		<!-- ═════════════ AMBANG KEPUTUSAN (DSS) ═════════════ -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Ambang Keputusan</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Kapan sistem menyarankan mencetak ulang, menagih, atau menahan produksi.
					</p>
				</div>
				<Gauge class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>

			<form method="POST" action="?/saveDecision" use:enhance={saveDecision} data-action="save-decision" class="space-y-5 px-5 py-4">
				<fieldset>
					<legend class="label">Judul</legend>
					<div class="mt-2 grid gap-3 sm:grid-cols-2">
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Margin minimum (%)</span>
							<input
								type="number"
								name="minMarginPct"
								min="0"
								max="95"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.title.minMarginPct}
							/>
						</label>
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Stok dianggap kritis (hari)</span>
							<input
								type="number"
								name="reorderCoverDays"
								min="1"
								max="365"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.title.reorderCoverDays}
							/>
						</label>
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Lambat laku (eks/bulan)</span>
							<input
								type="number"
								name="slowMoverPerMonth"
								min="0"
								max="10000"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.title.slowMoverPerMonth}
							/>
						</label>
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Nilai modal tertahan (Rp)</span>
							<input
								type="text"
								inputmode="numeric"
								name="deadStockValue"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.title.deadStockValue}
							/>
						</label>
					</div>
				</fieldset>

				<fieldset class="border-t border-ink-100 pt-4 dark:border-ink-800">
					<legend class="label">Kas</legend>
					<div class="mt-2 grid gap-3 sm:grid-cols-2">
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Toleransi lewat tenggat (hari)</span>
							<input
								type="number"
								name="overdueWarnDays"
								min="0"
								max="365"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.cash.overdueWarnDays}
							/>
						</label>
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Konsentrasi piutang (%)</span>
							<input
								type="number"
								name="concentrationPct"
								min="1"
								max="100"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.cash.concentrationPct}
							/>
						</label>
						<label class="block sm:col-span-2">
							<span class="text-xs text-ink-600 dark:text-ink-300">Tahan produksi bila piutang lewat (Rp)</span>
							<input
								type="text"
								inputmode="numeric"
								name="holdProductionThreshold"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.cash.holdProductionThreshold}
							/>
						</label>
					</div>
				</fieldset>

				<fieldset class="border-t border-ink-100 pt-4 dark:border-ink-800">
					<legend class="label">Produksi</legend>
					<div class="mt-2 grid gap-3 sm:grid-cols-2">
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Batas task terbuka / orang</span>
							<input
								type="number"
								name="maxOpenTasks"
								min="1"
								max="100"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.production.maxOpenTasks}
							/>
						</label>
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Task dianggap macet (hari)</span>
							<input
								type="number"
								name="staleTaskDays"
								min="1"
								max="365"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.production.staleTaskDays}
							/>
						</label>
						<label class="block">
							<span class="text-xs text-ink-600 dark:text-ink-300">Peringatan tenggat (hari)</span>
							<input
								type="number"
								name="deadlineWarnDays"
								min="0"
								max="180"
								step="1"
								class="field mt-1 text-right font-mono tabular-nums"
								value={data.decision.production.deadlineWarnDays}
							/>
						</label>
					</div>
				</fieldset>

				<div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 dark:border-ink-800">
					<p class="max-w-sm text-[11px] text-ink-400">
						Rumus tidak berubah, hanya ambangnya. Perubahan langsung dipakai di
						<a href="/dss" class="link">pusat keputusan</a>.
					</p>
					<SubmitButton class="btn-primary" busy={forms.isBusy('save-decision')} busyLabel="Menyimpan…">
						Simpan ambang
					</SubmitButton>
				</div>
			</form>
		</section>
	</div>

	<!-- ═════════════ PRATINJAU ═════════════ -->
	<aside class="min-w-0 space-y-5">
		<section class="card h-fit">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Pratinjau HPP</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						176 halaman A5 bookpaper, perfect binding, doff, 300 eksemplar.
					</p>
				</div>
				<Landmark class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>

			<dl class="divide-y divide-ink-100 dark:divide-ink-800">
				<div class="flex items-baseline justify-between gap-3 px-5 py-2.5">
					<dt class="text-xs text-ink-500 dark:text-ink-400">Kertas &amp; tinta</dt>
					<dd class="font-mono text-xs tabular-nums">{formatIDR(paperAndInk)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-2.5">
					<dt class="text-xs text-ink-500 dark:text-ink-400">Jilid</dt>
					<dd class="font-mono text-xs tabular-nums">{formatIDR(data.print.bindingCost.PERFECT_BINDING)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-2.5">
					<dt class="text-xs text-ink-500 dark:text-ink-400">Laminasi</dt>
					<dd class="font-mono text-xs tabular-nums">{formatIDR(data.print.laminationCost.DOFF)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-2.5">
					<dt class="text-xs font-medium">HPP per eksemplar</dt>
					<dd class="font-mono text-sm tabular-nums">{formatIDR(unit)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-3 px-5 py-2.5">
					<dt class="text-xs text-ink-500 dark:text-ink-400">× 300 eksemplar</dt>
					<dd class="font-mono text-xs tabular-nums">{formatIDR(subtotal)}</dd>
				</div>
				{#if vat > 0}
					<div class="flex items-baseline justify-between gap-3 px-5 py-2.5">
						<dt class="text-xs text-ink-500 dark:text-ink-400">PPN {previewState.vatPct}%</dt>
						<dd class="font-mono text-xs tabular-nums">{formatIDR(vat)}</dd>
					</div>
				{/if}
				<div class="flex items-baseline justify-between gap-3 bg-ink-50 px-5 py-3 dark:bg-ink-800/50">
					<dt class="text-xs font-semibold">Total</dt>
					<dd class="font-mono text-base font-semibold tabular-nums">{formatIDR(subtotal + vat)}</dd>
				</div>
			</dl>

			<p class="border-t border-ink-100 px-5 py-3 text-[11px] leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
				Pratinjau berubah saat Anda mengetik, sebelum disimpan. Setelah disimpan, order cetak
				baru memakai angka ini; order cetak yang sudah tercatat tidak dihitung ulang.
			</p>
		</section>

		<section class="card p-5">
			<h2 class="text-sm font-semibold">Catatan</h2>
			<ul class="mt-2 space-y-2 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
				<li>
					Tarif disimpan di database, bukan di kode. Tidak perlu deploy untuk menyesuaikan
					harga vendor.
				</li>
				<li>
					PPN dihitung dari subtotal HPP dan muncul sebagai baris terpisah pada pratinjau.
				</li>
				<li>
					Semua perubahan tercatat di <a href="/admin/audit" class="link">Jejak Aktivitas</a>
					beserta siapa yang mengubah.
				</li>
			</ul>
		</section>
	</aside>
</div>
