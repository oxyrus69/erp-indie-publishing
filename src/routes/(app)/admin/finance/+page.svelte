<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import PeriodPicker from '$lib/components/PeriodPicker.svelte';
	import CashInChart from '$lib/charts/CashInChart.svelte';
	import AgingChart from '$lib/charts/AgingChart.svelte';
	import TableToolbar from '$lib/components/TableToolbar.svelte';
	import TablePager from '$lib/components/TablePager.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { nextSort, tableHref } from '$lib/table/query';
	import type { DataColumn } from '$lib/table/types';
	import {
		INVOICE_KIND,
		INVOICE_STATUS,
		ROLE_LABEL_ID,
		SPECIALTY_LABEL,
		TONE_CLASS,
		formatDate,
		formatDateTime,
		formatIDR,
		statusOf
	} from '$lib/ui';
	import {
		AlertTriangle,
		ArrowRight,
		Banknote,
		Check,
		CircleDollarSign,
		Clock,
		Landmark,
		Receipt,
		Wallet,
		X
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Invoice = PageData['invoices'][number];
	type Withdrawal = PageData['withdrawals'][number];

	/** Tab mengikuti URL saat navigasi, tetapi tetap bisa diganti tanpa reload. */
	let tabOverride = $state<'receivables' | 'payables' | 'cash' | null>(null);
	const tab = $derived(tabOverride ?? (data.tab === 'payables' || data.tab === 'cash' ? data.tab : 'receivables'));

	/**
	 * Param periode aktif (bulan/rentang) yang harus ikut pada setiap navigasi:
	 * sort, filter, paging, ekspor, dan lencana tab. Tanpa ini, sekali klik
	 * kolom sort atau ganti halaman, filter periode yang sedang dipakai hilang
	 * dan angka diam-diam kembali ke "semua waktu".
	 */
	const periodQs = $derived<Record<string, string>>(
		data.period.month
			? { month: data.period.month }
			: {
					...(data.period.from ? { from: data.period.from } : {}),
					...(data.period.to ? { to: data.period.to } : {})
				}
	);

	/** Baris yang dicentang untuk aksi massal. */
	let selectedInvoices = $state<string[]>([]);

	const forms = createFormHandler();

	const PAY_CONSEQUENCE: Record<string, string> = {
		DOWN_PAYMENT:
			'Membuka pipeline produksi: lima task otomatis dibuat dan track editorial, tata letak, serta cover langsung berjalan.',
		FINAL_SETTLEMENT:
			'Membuka track ISBN dan cetak, menandai order lunas, serta membuka file resolusi tinggi setelah cover dan tata letak disetujui.',
		EXTRA_REVISION:
			'Membuka kembali task yang ditunda dan menambah satu kuota revisi untuk penulis.',
		PRINT_ADDON: 'Membuka track cetak agar order cetak dapat dibuat.',
		ADDON_SERVICE: 'Mencatat pembayaran layanan tambahan pada order ini.'
	};

	const WITHDRAWAL_CONSEQUENCE: Record<string, string> = {
		APPROVE:
			'Saldo tetap ditahan sampai ditandai dibayar. Setelah disetujui, status tidak bisa dikembalikan ke Diajukan.',
		PAY: 'Status menjadi Dibayar secara permanen dan saldo dianggap keluar dari kas. Pastikan transfer sudah dilakukan.',
		REJECT: 'Status menjadi Ditolak secara permanen dan nominal dikembalikan ke dompet pemiliknya.'
	};

	const tabs = $derived([
		{
			key: 'receivables' as const,
			label: 'Piutang',
			count: data.invoiceQuery.total
		},
		{ key: 'payables' as const, label: 'Kewajiban', count: data.pendingWithdrawalCount },
		{ key: 'cash' as const, label: 'Kas & HPP', count: data.printRuns.length }
	]);

	const WALLET_LABEL: Record<string, string> = {
		FREELANCER: 'Komisi Freelancer',
		ROYALTY: 'Royalti Penulis'
	};

	const WITHDRAWAL_STATUS: Record<string, { label: string; tone: import('$lib/ui').Tone }> = {
		REQUESTED: { label: 'Diajukan', tone: 'review' },
		APPROVED: { label: 'Disetujui', tone: 'progress' },
		PAID: { label: 'Dibayar', tone: 'done' },
		REJECTED: { label: 'Ditolak', tone: 'danger' }
	};

	const WITHDRAWAL_STATUSES = ['REQUESTED', 'APPROVED', 'PAID', 'REJECTED'] as const;

	function dueLabel(days: number | null, status: string): { text: string; cls: string } {
		if (status === 'PAID') return { text: 'Lunas', cls: 'text-emerald-600 dark:text-emerald-400' };
		if (days === null) return { text: 'Tanpa jatuh tempo', cls: 'text-ink-400' };
		if (days < 0) {
			return { text: `Lewat ${Math.abs(days)} hari`, cls: 'text-red-600 dark:text-red-400' };
		}
		if (days === 0) return { text: 'Jatuh tempo hari ini', cls: 'text-orange-600 dark:text-orange-400' };
		return { text: `${days} hari lagi`, cls: 'text-ink-500 dark:text-ink-400' };
	}

	function withdrawalById(id: string) {
		return data.withdrawals.find((w) => w.id === id) ?? null;
	}

	/** Nilai terpilih untuk konfirmasi massal — dihitung dari baris yang tampil. */
	const selectedRows = $derived(
		data.invoices.filter((invoice) => selectedInvoices.includes(invoice.id))
	);
	const selectedTotal = $derived(
		selectedRows.reduce((acc, invoice) => acc + invoice.outstanding, 0)
	);
	const selectedUnpaid = $derived(selectedRows.filter((row) => row.status !== 'PAID'));

	const singlePaySubmit = forms.make({
		key: 'pay-invoice',
		successTitle: 'Pembayaran terverifikasi',
		errorTitle: 'Verifikasi gagal',
		keepValues: true,
		confirm: ({ formData }) => {
			const invoice = data.invoices.find(
				(row) => row.id === String(formData.get('invoiceId') ?? '')
			);
			if (!invoice) return null;
			return {
				title: `Verifikasi lunas ${invoice.invoiceNumber}?`,
				confirmLabel: 'Ya, verifikasi lunas',
				facts: [
					{ label: 'Invoice', value: invoice.invoiceNumber },
					{ label: 'Jenis', value: INVOICE_KIND[invoice.kind] ?? invoice.kind },
					{ label: 'Nominal', value: formatIDR(invoice.outstanding) },
					{ label: 'Proyek', value: invoice.projectTitle ?? invoice.orderNumber ?? '—' }
				],
				note: `${
					PAY_CONSEQUENCE[invoice.kind] ?? 'Status invoice akan menjadi Lunas.'
				} Tindakan ini permanen dan tidak bisa dibatalkan dari aplikasi.`
			};
		}
	});

	const bulkPaySubmit = forms.make({
		key: 'pay-invoices-bulk',
		successTitle: 'Invoice terverifikasi',
		errorTitle: 'Verifikasi massal gagal',
		keepValues: true,
		onSuccess: () => (selectedInvoices = []),
		confirm: () => {
			if (selectedUnpaid.length === 0) return null;
			return {
				title: `Verifikasi ${selectedUnpaid.length} invoice sekaligus?`,
				confirmLabel: `Ya, verifikasi ${selectedUnpaid.length} invoice`,
				facts: [
					{ label: 'Jumlah invoice', value: String(selectedUnpaid.length) },
					{ label: 'Total nominal', value: formatIDR(selectedTotal) },
					{ label: 'Nomor', value: selectedUnpaid.map((row) => row.invoiceNumber).join(', ') }
				],
				note: 'Setiap invoice diverifikasi dalam transaksinya sendiri, jadi efek tahap produksi berjalan per order. Status invoice menjadi Lunas secara permanen dan tidak bisa dibatalkan dari aplikasi.'
			};
		}
	});

	const bulkOverdueSubmit = forms.make({
		key: 'mark-overdue-bulk',
		successTitle: 'Invoice ditandai jatuh tempo',
		errorTitle: 'Gagal menandai jatuh tempo',
		keepValues: true,
		onSuccess: () => (selectedInvoices = []),
		confirm: () => {
			const unpaid = selectedRows.filter((row) => row.status === 'UNPAID');
			if (unpaid.length === 0) return null;
			return {
				title: `Tandai ${unpaid.length} invoice sebagai jatuh tempo?`,
				confirmLabel: 'Ya, tandai jatuh tempo',
				tone: 'danger',
				facts: [
					{ label: 'Jumlah', value: String(unpaid.length) },
					{ label: 'Nomor', value: unpaid.map((row) => row.invoiceNumber).join(', ') }
				],
				note: 'Penanda ini muncul di antrean penagihan dan dasbor sebagai tindakan mendesak. Hanya invoice berstatus Belum Bayar yang berubah.'
			};
		}
	});

	const withdrawalSubmit = forms.make({
		key: 'process-withdrawal',
		successTitle: 'Penarikan diproses',
		errorTitle: 'Penarikan gagal',
		keepValues: true,
		confirm: ({ formData, submitter }) => {
			const withdrawal = withdrawalById(String(formData.get('withdrawalId') ?? ''));
			if (!withdrawal) return null;

			const raw =
				String(formData.get('action') ?? '') ||
				(submitter instanceof HTMLButtonElement ? submitter.value : '');
			const action: 'APPROVE' | 'PAY' | 'REJECT' =
				raw === 'PAY' || raw === 'REJECT' ? raw : 'APPROVE';

			return {
				title:
					action === 'APPROVE'
						? `Setujui penarikan ${formatIDR(withdrawal.amountNum)}?`
						: action === 'PAY'
							? `Tandai penarikan ${formatIDR(withdrawal.amountNum)} sudah dibayar?`
							: `Tolak penarikan ${formatIDR(withdrawal.amountNum)}?`,
				confirmLabel:
					action === 'APPROVE'
						? 'Ya, setujui'
						: action === 'PAY'
							? 'Ya, sudah dibayar'
							: 'Ya, tolak',
				tone: action === 'REJECT' ? 'danger' : 'primary',
				facts: [
					{ label: 'Penerima', value: withdrawal.userName },
					{ label: 'Dompet', value: WALLET_LABEL[withdrawal.wallet] ?? withdrawal.wallet },
					{ label: 'Nominal', value: formatIDR(withdrawal.amountNum) },
					{
						label: 'Rekening',
						value: withdrawal.bankAccountNumber
							? `${withdrawal.bankName ?? '—'} · ${withdrawal.bankAccountNumber}`
							: 'Belum diisi'
					}
				],
				note: WITHDRAWAL_CONSEQUENCE[action]
			};
		}
	});

	/* ------------------------------ Kolom tabel ------------------------------ */

	const invoiceColumns: DataColumn<Invoice>[] = [
		{ id: 'number', header: 'Invoice / Proyek', mobile: 'primary', cell: invoiceNumberCell },
		{ id: 'due', header: 'Jatuh Tempo', cell: invoiceDueCell },
		{ id: 'amount', header: 'Nominal', align: 'end', cell: invoiceAmountCell },
		{
			id: 'actions',
			header: 'Aksi',
			align: 'end',
			sortable: false,
			mobile: 'block',
			cell: invoiceActionCell
		}
	];

	const withdrawalColumns: DataColumn<Withdrawal>[] = [
		{ id: 'user', header: 'Penerima', mobile: 'primary', cell: withdrawalUserCell },
		{ id: 'wallet', header: 'Dompet', sortable: false, mobile: 'hide', cell: withdrawalWalletCell },
		{ id: 'amount', header: 'Nominal', align: 'end', cell: withdrawalAmountCell },
		{ id: 'status', header: 'Status', align: 'end', cell: withdrawalStatusCell },
		{ id: 'actions', header: 'Aksi', align: 'end', sortable: false, mobile: 'block', cell: withdrawalActionCell }
	];
	const invoiceSortHref = (columnId: string) =>
		tableHref('/admin/finance', data.invoiceQuery, {
			...nextSort(data.invoiceQuery, columnId),
			...periodQs,
			page: null,
			tab: 'receivables'
		});
	const withdrawalSortHref = (columnId: string) =>
		tableHref('/admin/finance', data.withdrawalQuery, {
			...nextSort(data.withdrawalQuery, columnId),
			...periodQs,
			page: null,
			tab: 'payables'
		});

	/**
	 * Membangun tautan dengan mempertahankan periode aktif. Dipakai oleh
	 * "Hapus filter" (yang tidak boleh membuang periode) dan tombol rekap
	 * siap cetak, agar konteks tanggal berjalan tidak hilang saat navigasi.
	 */
	function keepPeriod(base: string, extra: Record<string, string> = {}): string {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries({ ...extra, ...periodQs })) {
			if (value) params.set(key, value);
		}
		const qs = params.toString();
		return qs ? `${base}?${qs}` : base;
	}

	const printColumns: DataColumn<PageData['printRuns'][number]>[] = [
		{ id: 'title', header: 'Buku', mobile: 'primary', cell: printTitleCell },
		{ id: 'qty', header: 'Qty', align: 'end', sortable: false, cell: printQtyCell },
		{ id: 'cost', header: 'HPP/Unit', align: 'end', sortable: false, cell: printCostCell },
		{ id: 'total', header: 'Total', align: 'end', sortable: false, cell: printTotalCell }
	];
</script>

<svelte:head><title>Keuangan · ERP Penerbitan</title></svelte:head>

<!-- ══════════════════════════ HEADER ══════════════════════════ -->
<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Buku Kas</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Keuangan</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				Piutang {formatIDR(data.kpi.receivable)} · kewajiban {formatIDR(data.kpi.liabilities)} ·
				{data.pendingWithdrawalCount} penarikan menunggu
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a href="/projects" class="btn-secondary">Proyek <ArrowRight class="size-4" /></a>
			<a href="/admin" class="btn-secondary">Dasbor <ArrowRight class="size-4" /></a>
		</div>
	</div>

	{#if data.kpi.overdueCount > 0}
		<ul class="mt-5 flex flex-wrap gap-2">
			<li>
				<span class="badge {TONE_CLASS.danger}">
					<AlertTriangle class="size-3" strokeWidth={2} />
					{data.kpi.overdueCount} invoice jatuh tempo · {formatIDR(data.kpi.overdueAmount)}
				</span>
			</li>
			{#if data.kpi.dueSoonCount > 0}
				<li>
					<span class="badge {TONE_CLASS.warn}">
						{data.kpi.dueSoonCount} jatuh tempo dalam 7 hari
					</span>
				</li>
			{/if}
		</ul>
	{/if}
</header>

<!-- ══════════════════════════ PERIODE ══════════════════════════ -->
<PeriodPicker
	period={data.period}
	quick={data.quickPeriods}
	action="/admin/finance"
	hidden={{ tab }}
/>

<!-- ══════════════════════════ KPI ══════════════════════════ -->
<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Kas Diterima</p>
			<CircleDollarSign class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.revenue)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Dari {data.kpi.paidCount} invoice lunas
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Piutang Berjalan</p>
			<Receipt class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.receivable)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.kpi.openCount} invoice belum lunas
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Kewajiban Saldo</p>
			<Wallet class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.liabilities)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Komisi {formatIDR(data.kpi.freelancerPayable)} · royalti
			{formatIDR(data.kpi.royaltyPayable)}
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Kas Bersih</p>
			<Landmark class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p
			class="mt-2 font-mono text-xl tabular-nums {data.kpi.netCash < 0
				? 'text-red-600 dark:text-red-400'
				: ''}"
		>
			{formatIDR(data.kpi.netCash)}
		</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Setelah HPP cetak & penarikan dibayar
		</p>
	</article>
</section>

<!-- ══════════════════════════ GRAFIK ══════════════════════════ -->
<section class="mb-6 grid gap-5 lg:grid-cols-2">
	<div class="card min-w-0 p-5">
		<CashInChart points={data.analytics.cashIn} />
	</div>
	<div class="card min-w-0 p-5">
		<AgingChart buckets={data.analytics.aging} />
	</div>
</section>

<!-- ══════════════════════════ TAB ══════════════════════════ -->
<div class="mb-4 flex flex-wrap items-center gap-1.5">
	{#each tabs as t (t.key)}
		<button
			type="button"
			class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
				{tab === t.key
				? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600 dark:text-white'
				: 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'}"
			onclick={() => (tabOverride = t.key)}
		>
			{t.label}
			<span class="ml-1 font-mono text-[10px] opacity-60">{t.count}</span>
		</button>
	{/each}
</div>

<!-- ══════════════════════════ PIUTANG ══════════════════════════ -->
{#if tab === 'receivables'}
	<div class="grid gap-5 xl:grid-cols-3">
		<section class="card min-w-0 xl:col-span-2">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Antrean Penagihan</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Urut dari yang paling mendesak. Centang beberapa invoice untuk memverifikasi
						sekaligus.
					</p>
				</div>
				<Receipt class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>

			<div class="px-5 pt-4">
				<TableToolbar
					action="/admin/finance"
					query={data.invoiceQuery.q}
					searchPlaceholder="Cari nomor, proyek, penulis…"
					size={data.invoiceQuery.size}
					hidden={{
						tab: 'receivables',
						sort: data.invoiceQuery.sort,
						dir: data.invoiceQuery.dir,
						...periodQs,
						...Object.fromEntries(
							Object.entries(data.invoiceQuery.filters).filter(([key]) => key !== 'status')
						)
					}}
					resetHref={keepPeriod('/admin/finance', { tab: 'receivables' })}
					filters={[
						{
							name: 'status',
							label: 'Status',
							value: data.invoiceQuery.filters.status ?? '',
							options: Object.keys(INVOICE_STATUS).map((key) => ({
								value: key,
								label: statusOf(INVOICE_STATUS, key).label
							}))
						},
						{
							name: 'bucket',
							label: 'Jatuh tempo',
							value: data.invoiceQuery.filters.bucket ?? '',
							options: [
								{ value: 'overdue', label: 'lewat tenggat' },
								{ value: 'dueSoon', label: '≤ 7 hari' },
								{ value: 'notDue', label: '> 7 hari' }
							]
						}
					]}
				/>
			</div>

			<DataTable
				rows={data.invoices}
				columns={invoiceColumns}
				caption="Antrean penagihan invoice beserta nominal dan jatuh tempo"
				sort={{ id: data.invoiceQuery.sort, dir: data.invoiceQuery.dir }}
				sortHref={invoiceSortHref}
				selectable
				selected={selectedInvoices}
				onselectionchange={(ids) => (selectedInvoices = ids)}
				rowLabel={(invoice) => invoice.invoiceNumber}
			>
				{#snippet empty()}
					<div class="flex flex-col items-center gap-1">
						<Check class="size-6 text-emerald-500" strokeWidth={1.5} />
						<p class="text-sm font-medium">Tidak ada invoice yang cocok</p>
						<p class="text-xs text-ink-500 dark:text-ink-400">
							Ubah filter status atau jatuh tempo untuk melihat tagihan lain.
						</p>
						<a href={keepPeriod('/admin/finance', { tab: 'receivables' })} class="link mt-1 text-xs">
							Tampilkan semua piutang
						</a>
					</div>
				{/snippet}
			</DataTable>

			<TablePager
				from={data.invoiceQuery.from}
				to={data.invoiceQuery.to}
				total={data.invoiceQuery.total}
				page={data.invoiceQuery.page}
				totalPages={data.invoiceQuery.totalPages}
				href={(page) =>
					tableHref('/admin/finance', data.invoiceQuery, { ...periodQs, page, tab: 'receivables' })}
				noun="invoice"
			/>
		</section>

		<div class="min-w-0 space-y-5">
			<!-- Aksi massal: hanya muncul saat ada baris dicentang. -->
			{#if selectedInvoices.length > 0}
				<section class="card border-yale-200 dark:border-yale-900/60">
					<div class="card-header">
						<div>
							<h2 class="text-sm font-semibold">{selectedInvoices.length} invoice dipilih</h2>
							<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
								Total {formatIDR(selectedTotal)} · {selectedUnpaid.length} belum lunas
							</p>
						</div>
						<button
							type="button"
							class="text-xs text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
							onclick={() => (selectedInvoices = [])}
						>
							Batal pilih
						</button>
					</div>
					<div class="space-y-2 px-5 py-4">
						<form method="POST" action="?/pay-invoices-bulk" use:enhance={bulkPaySubmit} data-action="bulk-pay">
							{#each selectedInvoices as id (id)}
								<input type="hidden" name="invoiceId" value={id} />
							{/each}
							<SubmitButton
								class="btn-primary w-full !py-1.5 !text-xs"
								busy={forms.isBusy('bulk-pay')}
								busyLabel="Memverifikasi…"
								disabled={selectedUnpaid.length === 0}
							>
								<Check class="size-3.5" /> Verifikasi {selectedUnpaid.length} invoice
							</SubmitButton>
						</form>

						<form method="POST" action="?/mark-overdue-bulk" use:enhance={bulkOverdueSubmit} data-action="bulk-overdue">
							{#each selectedInvoices as id (id)}
								<input type="hidden" name="invoiceId" value={id} />
							{/each}
							<SubmitButton
								class="btn-secondary w-full !py-1.5 !text-xs"
								busy={forms.isBusy('bulk-overdue')}
								busyLabel="Menandai…"
							>
								<AlertTriangle class="size-3.5" /> Tandai jatuh tempo
							</SubmitButton>
						</form>

						<p class="text-[10px] leading-relaxed text-ink-400">
							Setiap invoice diverifikasi dalam transaksinya sendiri. Bila satu gagal, yang lain
							tetap diproses dan alasannya disebut di notifikasi.
						</p>
					</div>
				</section>
			{/if}

			<!-- Cetak / ekspor rekap piutang. -->
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Rekap &amp; Ekspor</h2>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							Mengikuti filter yang sedang aktif di antrean penagihan.
						</p>
					</div>
					<Receipt class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				<div class="space-y-2 px-5 py-4">
					<a
						href={tableHref('/admin/finance/export', data.invoiceQuery, {
							...periodQs,
							tab: 'receivables',
							format: 'csv',
							page: null,
							size: null
						})}
						class="btn-secondary w-full justify-center !py-1.5 !text-xs"
					>
						Unduh piutang (CSV)
					</a>
					<a
						href={tableHref('/admin/finance/export', data.withdrawalQuery, {
							...periodQs,
							tab: 'payables',
							format: 'csv',
							page: null,
							size: null
						})}
						class="btn-secondary w-full justify-center !py-1.5 !text-xs"
					>
						Unduh kewajiban (CSV)
					</a>
					<a
						href={keepPeriod('/admin/finance/laporan', {
							bulan: data.period.month ?? ''
						})}
						class="btn-secondary w-full justify-center !py-1.5 !text-xs"
					>
						Laporan HPP per judul
					</a>
					<a
						href={keepPeriod('/admin/finance/cetak', { tab: 'receivables' })}
						class="btn-secondary w-full justify-center !py-1.5 !text-xs"
						target="_blank"
						rel="noopener"
					>
						Rekap piutang siap cetak
					</a>
				</div>
			</section>

			<section class="card">
				<div class="card-header">
					<h2 class="text-sm font-semibold">Pembayaran Terakhir</h2>
					<Clock class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				{#if data.recentPaid.length === 0}
					<p class="px-5 py-8 text-center text-xs text-ink-500 dark:text-ink-400">
						Belum ada pembayaran terverifikasi.
					</p>
				{:else}
					<ul class="divide-y divide-ink-100 dark:divide-ink-800">
						{#each data.recentPaid as inv (inv.id)}
							<li class="px-5 py-3">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="truncate text-xs font-medium">{inv.projectTitle ?? inv.orderNumber}</p>
										<p class="font-mono text-[10px] text-ink-400">{inv.invoiceNumber}</p>
									</div>
									<p class="shrink-0 font-mono text-xs tabular-nums">{formatIDR(inv.amountNum)}</p>
								</div>
								<p class="mt-0.5 text-[10px] text-ink-400">
									{INVOICE_KIND[inv.kind] ?? inv.kind} · {formatDate(inv.paidAt ?? inv.createdAt)}
								</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	</div>
{/if}

<!-- ══════════════════════════ KEWAJIBAN ══════════════════════════ -->
{#if tab === 'payables'}
	<div class="grid gap-5 xl:grid-cols-3">
		<section class="card min-w-0 xl:col-span-2">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Permintaan Penarikan</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Setujui sebelum transfer, lalu tandai dibayar. Menolak mengembalikan saldo ke dompet.
					</p>
				</div>
				<Banknote class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>

			<div class="px-5 pt-4">
				<TableToolbar
					action="/admin/finance"
					query={data.withdrawalQuery.q}
					searchPlaceholder="Cari nama atau rekening…"
					size={data.withdrawalQuery.size}
					hidden={{
						tab: 'payables',
						sort: data.withdrawalQuery.sort,
						dir: data.withdrawalQuery.dir,
						...periodQs
					}}
					resetHref={keepPeriod('/admin/finance', { tab: 'payables' })}
					filters={[
						{
							name: 'status',
							label: 'Status',
							value: data.withdrawalQuery.filters.status ?? '',
							options: WITHDRAWAL_STATUSES.map((key) => ({
								value: key,
								label: WITHDRAWAL_STATUS[key]?.label ?? key
							}))
						}
					]}
				/>
			</div>

			<DataTable
				rows={data.withdrawals}
				columns={withdrawalColumns}
				caption="Permintaan penarikan saldo beserta rekening tujuan dan statusnya"
				sort={{ id: data.withdrawalQuery.sort, dir: data.withdrawalQuery.dir }}
				sortHref={withdrawalSortHref}
				rowLabel={(withdrawal) => `${withdrawal.userName} ${formatIDR(withdrawal.amountNum)}`}
			>
				{#snippet empty()}
					<div class="text-center">
						<p class="text-sm font-medium">Tidak ada permintaan penarikan</p>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							Penarikan baru muncul setelah freelancer atau penulis mengajukan.
						</p>
					</div>
				{/snippet}
			</DataTable>

			<TablePager
				from={data.withdrawalQuery.from}
				to={data.withdrawalQuery.to}
				total={data.withdrawalQuery.total}
				page={data.withdrawalQuery.page}
				totalPages={data.withdrawalQuery.totalPages}
				href={(page) =>
					tableHref('/admin/finance', data.withdrawalQuery, { ...periodQs, page, tab: 'payables' })}
				noun="penarikan"
			/>
		</section>

		<section class="card h-fit min-w-0">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Saldo Freelancer</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Dari ledger komisi — sudah siap ditarik
					</p>
				</div>
				<Wallet class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>
			{#if data.freelancers.length === 0}
				<p class="px-5 py-10 text-center text-xs text-ink-500 dark:text-ink-400">
					Belum ada komisi tercatat.
				</p>
			{:else}
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.freelancers as f (f.freelancerId)}
						<li class="px-5 py-2.5">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-xs font-medium">{f.freelancerName}</p>
									<p class="text-[10px] text-ink-400">
										{f.specialty ? (SPECIALTY_LABEL[f.specialty] ?? f.specialty) : 'Freelancer'} ·
										{f.entryCount} entri
									</p>
								</div>
								<div class="text-right">
									<p class="font-mono text-xs tabular-nums">{formatIDR(f.availableNum)}</p>
									{#if f.pendingNum !== 0}
										<p class="text-[10px] text-ink-400">tertahan {formatIDR(f.pendingNum)}</p>
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
{/if}

<!-- ══════════════════════════ KAS & HPP ══════════════════════════ -->
{#if tab === 'cash'}
	<div class="grid gap-5 xl:grid-cols-3">
		<section class="card min-w-0 xl:col-span-2">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Riwayat Cetak (HPP)</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Total {formatIDR(data.kpi.printCost)} untuk {data.kpi.printUnits} eksemplar
					</p>
				</div>
				<a href="/admin/finance/laporan" class="link text-xs">Laporan per bulan</a>
			</div>
			{#if data.printRuns.length === 0}
				<p class="px-5 py-14 text-center text-xs text-ink-500 dark:text-ink-400">
					Belum ada order cetak.
				</p>
			{:else}
				<DataTable
					rows={data.printRuns}
					columns={printColumns}
					caption="Riwayat order cetak beserta HPP per eksemplar dan total biaya"
					rowLabel={(run) => run.title}
				/>
			{/if}
		</section>

		<div class="min-w-0 space-y-5">
			<section class="card">
				<div class="card-header">
					<h2 class="text-sm font-semibold">Ringkasan Kas</h2>
					<Landmark class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				<dl class="divide-y divide-ink-100 text-sm dark:divide-ink-800">
					<div class="flex items-center justify-between px-5 py-2.5">
						<dt class="text-xs text-ink-500 dark:text-ink-400">Kas diterima</dt>
						<dd class="font-mono text-xs tabular-nums">{formatIDR(data.kpi.revenue)}</dd>
					</div>
					<div class="flex items-center justify-between px-5 py-2.5">
						<dt class="text-xs text-ink-500 dark:text-ink-400">HPP cetak</dt>
						<dd class="font-mono text-xs tabular-nums">−{formatIDR(data.kpi.printCost)}</dd>
					</div>
					<div class="flex items-center justify-between px-5 py-2.5">
						<dt class="text-xs text-ink-500 dark:text-ink-400">Penarikan dibayar</dt>
						<dd class="font-mono text-xs tabular-nums">
							−{formatIDR(data.kpi.settledWithdrawals)}
						</dd>
					</div>
					<div class="flex items-center justify-between px-5 py-2.5 font-medium">
						<dt class="text-xs">Kas bersih</dt>
						<dd class="font-mono text-sm tabular-nums">{formatIDR(data.kpi.netCash)}</dd>
					</div>
				</dl>
			</section>

			<section class="card">
				<div class="card-header">
					<h2 class="text-sm font-semibold">Royalti Terbesar</h2>
					<CircleDollarSign class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				{#if data.topRoyalty.length === 0}
					<p class="px-5 py-8 text-center text-xs text-ink-500 dark:text-ink-400">
						Belum ada penjualan buku.
					</p>
				{:else}
					<ul class="divide-y divide-ink-100 dark:divide-ink-800">
						{#each data.topRoyalty as r (r.projectId)}
							<li class="flex items-center justify-between gap-2 px-5 py-2.5">
								<a
									href="/projects/{r.projectId}"
									class="min-w-0 truncate rounded-sm text-xs text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
								>
									{r.title}
								</a>
								<span class="shrink-0 font-mono text-xs tabular-nums">
									{formatIDR(r.royalty)}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
				<p class="border-t border-ink-100 px-5 py-2.5 text-[10px] text-ink-400 dark:border-ink-800">
					Total royalti tersedia: {formatIDR(data.kpi.royaltyPayable)} · diperbarui
					{formatDateTime(new Date())}
				</p>
			</section>
		</div>
	</div>
{/if}

<!-- ══════════════════════════ SEL ══════════════════════════ -->

{#snippet invoiceNumberCell(invoice: Invoice)}
	<div class="min-w-0">
		<div class="flex flex-wrap items-center gap-x-2">
			<a
				href="/invoice/{invoice.id}"
				target="_blank"
				rel="noopener"
				class="whitespace-nowrap font-mono text-xs text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
				title="Buka invoice siap cetak"
			>
				{invoice.invoiceNumber}
			</a>
			<span class="whitespace-nowrap text-[10px] text-ink-400">
				{INVOICE_KIND[invoice.kind] ?? invoice.kind}
			</span>
		</div>
		{#if invoice.projectId}
			<a
				href="/projects/{invoice.projectId}"
				class="mt-0.5 block truncate rounded-sm text-[11px] text-ink-700 underline-offset-4 hover:underline dark:text-ink-200"
			>
				{invoice.projectTitle}
			</a>
		{:else}
			<p class="mt-0.5 truncate text-[11px] text-ink-400">{invoice.orderNumber}</p>
		{/if}
		<p class="truncate text-[10px] text-ink-400">{invoice.authorName ?? '—'}</p>
	</div>
{/snippet}

{#snippet invoiceDueCell(invoice: Invoice)}
	{@const due = dueLabel(invoice.days, invoice.status)}
	<div>
		<p class="text-xs">{formatDate(invoice.dueDate)}</p>
		<p class="text-[10px] font-medium {due.cls}">{due.text}</p>
	</div>
{/snippet}

{#snippet invoiceAmountCell(invoice: Invoice)}
	<p class="font-mono text-xs tabular-nums">{formatIDR(invoice.outstanding)}</p>
	{#if invoice.paidAmountNum > 0 && invoice.status !== 'PAID'}
		<p class="text-[10px] text-ink-400">
			Dibayar {formatIDR(invoice.paidAmountNum)} / {formatIDR(invoice.amountNum)}
		</p>
	{/if}
{/snippet}

{#snippet invoiceActionCell(invoice: Invoice)}
	{#if invoice.status !== 'PAID' && invoice.status !== 'VOID'}
		<form
			method="POST"
			action="?/pay-invoice"
			use:enhance={singlePaySubmit}
			data-action="pay-{invoice.id}"
			class="flex md:justify-end"
		>
			<input type="hidden" name="invoiceId" value={invoice.id} />
			<SubmitButton
				class="btn-primary !px-2.5 !py-1.5 !text-xs"
				busy={forms.isBusy(`pay-${invoice.id}`)}
				busyLabel="Memverifikasi…"
			>
				<Check class="size-3.5" /> Verifikasi
			</SubmitButton>
		</form>
	{:else if invoice.paidAt}
		<p class="text-[10px] text-ink-400 md:text-right">Lunas {formatDate(invoice.paidAt)}</p>
	{/if}
{/snippet}

{#snippet withdrawalUserCell(withdrawal: Withdrawal)}
	<div class="min-w-0">
		<p class="truncate text-sm font-medium">{withdrawal.userName}</p>
		<p class="truncate text-[10px] text-ink-400">
			{WALLET_LABEL[withdrawal.wallet] ?? withdrawal.wallet}{withdrawal.specialty
				? ` · ${SPECIALTY_LABEL[withdrawal.specialty] ?? withdrawal.specialty}`
				: ` · ${ROLE_LABEL_ID[withdrawal.userRole] ?? withdrawal.userRole}`}
		</p>
		<p class="truncate font-mono text-[10px] text-ink-400">
			{withdrawal.bankName ?? 'Bank belum diisi'}{withdrawal.bankAccountNumber
				? ` · ${withdrawal.bankAccountNumber}`
				: ''}{withdrawal.bankAccountName ? ` a.n. ${withdrawal.bankAccountName}` : ''}
		</p>
		{#if withdrawal.note}
			<p class="mt-0.5 text-[10px] text-ink-500 dark:text-ink-400">“{withdrawal.note}”</p>
		{/if}
	</div>
{/snippet}

{#snippet withdrawalWalletCell(withdrawal: Withdrawal)}
	<p class="text-[11px] text-ink-500 dark:text-ink-400">
		{WALLET_LABEL[withdrawal.wallet] ?? withdrawal.wallet}
	</p>
{/snippet}

{#snippet withdrawalAmountCell(withdrawal: Withdrawal)}
	<p class="font-mono text-xs tabular-nums">{formatIDR(withdrawal.amountNum)}</p>
	<p class="text-[10px] text-ink-400">{formatDate(withdrawal.processedAt ?? withdrawal.createdAt)}</p>
{/snippet}

{#snippet withdrawalStatusCell(withdrawal: Withdrawal)}
	<div class="flex md:justify-end">
		<StatusBadge {...statusOf(WITHDRAWAL_STATUS, withdrawal.status)} />
	</div>
{/snippet}

{#snippet withdrawalActionCell(withdrawal: Withdrawal)}
	{#if withdrawal.status === 'REQUESTED' || withdrawal.status === 'APPROVED'}
		<form
			method="POST"
			action="?/process-withdrawal"
			use:enhance={withdrawalSubmit}
			data-action="withdraw-{withdrawal.id}"
			class="flex items-center gap-1 md:justify-end"
		>
			<input type="hidden" name="withdrawalId" value={withdrawal.id} />
			{#if withdrawal.status === 'REQUESTED'}
				<SubmitButton
					name="action"
					value="APPROVE"
					class="btn-secondary min-h-9 !px-2.5 !py-1.5 !text-[11px]"
					busy={forms.isBusyAction(`withdraw-${withdrawal.id}`, 'APPROVE')}
					disabled={forms.isBusy(`withdraw-${withdrawal.id}`)}
					busyLabel="Memproses…"
					title="Setujui penarikan"
				>
					<Check class="size-3.5" /> Setujui
				</SubmitButton>
			{:else}
				<SubmitButton
					name="action"
					value="PAY"
					class="btn-primary min-h-9 !px-2.5 !py-1.5 !text-[11px]"
					busy={forms.isBusyAction(`withdraw-${withdrawal.id}`, 'PAY')}
					disabled={forms.isBusy(`withdraw-${withdrawal.id}`)}
					busyLabel="Memproses…"
					title="Tandai sudah ditransfer"
				>
					<Banknote class="size-3.5" /> Bayar
				</SubmitButton>
			{/if}
			<SubmitButton
				name="action"
				value="REJECT"
				class="btn-danger min-h-9 min-w-9 !px-2 !py-1.5 !text-[11px]"
				busy={forms.isBusyAction(`withdraw-${withdrawal.id}`, 'REJECT')}
				disabled={forms.isBusy(`withdraw-${withdrawal.id}`)}
				busyLabel=""
				title="Tolak dan kembalikan saldo"
				aria-label="Tolak dan kembalikan saldo"
			>
				<X class="size-3.5" />
				<span class="sr-only">Tolak</span>
			</SubmitButton>
		</form>
	{:else}
		<p class="text-[10px] text-ink-400 md:text-right">
			{withdrawal.processedAt ? formatDate(withdrawal.processedAt) : '—'}
		</p>
	{/if}
{/snippet}

{#snippet printTitleCell(run: PageData['printRuns'][number])}
	<a
		href="/projects/{run.projectId}"
		class="block truncate text-xs text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
	>
		{run.title}
	</a>
	<p class="text-[10px] text-ink-400">{formatDate(run.createdAt)}</p>
{/snippet}

{#snippet printQtyCell(run: PageData['printRuns'][number])}
	<p class="font-mono text-xs tabular-nums">{run.quantity}</p>
{/snippet}

{#snippet printCostCell(run: PageData['printRuns'][number])}
	<p class="font-mono text-xs tabular-nums">{formatIDR(run.costPerUnitNum)}</p>
{/snippet}

{#snippet printTotalCell(run: PageData['printRuns'][number])}
	<p class="font-mono text-xs tabular-nums">{formatIDR(run.totalCostNum)}</p>
{/snippet}
