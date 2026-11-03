<script lang="ts">
	import PrintDocument from '$lib/components/PrintDocument.svelte';
	import { INVOICE_STATUS, ROLE_LABEL_ID, SPECIALTY_LABEL, formatDate, formatIDR, statusOf } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const isReceivables = $derived(data.tab === 'receivables');

	/** Periode ikut tercetak: dokumen arsip harus menyebut rentang yang dipakai. */
	const periodLabel = $derived(data.period?.isAllTime ? 'Semua waktu' : (data.period?.label ?? 'Semua waktu'));

	const meta = $derived(
		isReceivables
			? [
					{ label: 'Filter', value: data.filter ?? 'Semua' },
					{ label: 'Periode', value: periodLabel },
					{ label: 'Jumlah', value: `${data.totals?.count ?? 0} invoice` },
					{ label: 'Sisa tagihan', value: formatIDR(data.totals?.outstanding ?? 0) }
				]
			: [
					{ label: 'Cakupan', value: 'Semua penarikan' },
					{ label: 'Periode', value: periodLabel },
					{ label: 'Menunggu', value: formatIDR(data.totals?.total ?? 0) }
				]
	);
</script>

<PrintDocument
	title={isReceivables ? 'Rekap Piutang' : 'Rekap Kewajiban'}
	subtitle={isReceivables
		? 'Daftar tagihan yang belum lunas beserta sisa yang harus ditagih.'
		: 'Daftar permintaan penarikan saldo freelancer dan royalti penulis.'}
	{meta}
	backHref="/admin/finance?tab={data.tab}"
	backLabel="Kembali ke keuangan"
>
	{#if isReceivables}
		<table class="doc-table">
			<caption class="sr-only">Rekap piutang per invoice</caption>
			<thead>
				<tr>
					<th scope="col">Invoice</th>
					<th scope="col">Proyek / Penulis</th>
					<th scope="col">Jatuh tempo</th>
					<th scope="col" class="text-right!">Nominal</th>
					<th scope="col" class="text-right!">Sisa</th>
				</tr>
			</thead>
			<tbody>
				{#each data.invoices ?? [] as invoice (invoice.invoiceNumber)}
					<tr>
						<td>
							<p class="font-mono text-[11px]">{invoice.invoiceNumber}</p>
							<p class="text-[10px] text-ink-500 dark:text-ink-400">
								{data.kinds?.[invoice.kind] ?? invoice.kind} ·
								{statusOf(INVOICE_STATUS, invoice.status).label}
							</p>
						</td>
						<td>
							<p>{invoice.projectTitle ?? invoice.orderNumber}</p>
							<p class="text-[10px] text-ink-500 dark:text-ink-400">
								{invoice.authorName ?? '—'}
							</p>
						</td>
						<td>{formatDate(invoice.dueDate)}</td>
						<td class="text-right font-mono tabular-nums">{formatIDR(invoice.amountNum)}</td>
						<td class="text-right font-mono font-medium tabular-nums">
							{formatIDR(invoice.outstanding)}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="py-8 text-center text-ink-500">
							Tidak ada tagihan pada filter ini.
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<th scope="row" colspan="3" class="text-left">Total</th>
					<td class="text-right font-mono tabular-nums">
						{formatIDR(data.totals?.total ?? 0)}
					</td>
					<td class="text-right font-mono font-semibold tabular-nums">
						{formatIDR(data.totals?.outstanding ?? 0)}
					</td>
				</tr>
			</tfoot>
		</table>

		<div class="mt-8 grid gap-8 text-[10px] sm:grid-cols-2">
			<div>
				<p class="text-ink-500">Disiapkan oleh</p>
				<div class="mt-10 border-t border-ink-300 pt-1 dark:border-ink-700">Nama &amp; tanggal</div>
			</div>
			<div>
				<p class="text-ink-500">Disetujui oleh</p>
				<div class="mt-10 border-t border-ink-300 pt-1 dark:border-ink-700">Nama &amp; tanggal</div>
			</div>
		</div>
	{:else}
		<table class="doc-table">
			<caption class="sr-only">Rekap permintaan penarikan saldo</caption>
			<thead>
				<tr>
					<th scope="col">Penerima</th>
					<th scope="col">Rekening</th>
					<th scope="col">Diminta</th>
					<th scope="col">Status</th>
					<th scope="col" class="text-right!">Nominal</th>
				</tr>
			</thead>
			<tbody>
				{#each data.withdrawals ?? [] as withdrawal (withdrawal.bankAccountNumber + withdrawal.createdAt.toString())}
					<tr>
						<td>
							<p>{withdrawal.userName}</p>
							<p class="text-[10px] text-ink-500 dark:text-ink-400">
								{withdrawal.wallet === 'ROYALTY'
									? 'Royalti Penulis'
									: 'Komisi Freelancer'}{withdrawal.specialty
									? ` · ${SPECIALTY_LABEL[withdrawal.specialty] ?? withdrawal.specialty}`
									: ` · ${ROLE_LABEL_ID[withdrawal.userRole] ?? withdrawal.userRole}`}
							</p>
						</td>
						<td class="font-mono text-[10px]">
							{withdrawal.bankName ?? '—'}
							{#if withdrawal.bankAccountNumber}<br />{withdrawal.bankAccountNumber}{/if}
							{#if withdrawal.bankAccountName}<br />a.n. {withdrawal.bankAccountName}{/if}
						</td>
						<td>{formatDate(withdrawal.createdAt)}</td>
						<td>{withdrawal.status}</td>
						<td class="text-right font-mono tabular-nums">{formatIDR(withdrawal.amountNum)}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="py-8 text-center text-ink-500">Belum ada penarikan.</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<th scope="row" colspan="4" class="text-left">Menunggu pembayaran</th>
					<td class="text-right font-mono font-semibold tabular-nums">
						{formatIDR(data.totals?.total ?? 0)}
					</td>
				</tr>
			</tfoot>
		</table>
	{/if}
</PrintDocument>
