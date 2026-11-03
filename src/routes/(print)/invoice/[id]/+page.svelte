<script lang="ts">
	import { ArrowLeft, Printer } from 'lucide-svelte';
	import { INVOICE_KIND, INVOICE_STATUS, formatDate, formatIDR, statusOf } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const invoice = $derived(data.invoice);
	const printedAt = new Intl.DateTimeFormat('id-ID', {
		dateStyle: 'long',
		timeStyle: 'short'
	}).format(new Date());

	/** Nomor dokumen stabil per invoice, dipakai sebagai rujukan pembayaran. */
	const reference = $derived(`REF/${invoice.invoiceNumber}`);
</script>

<svelte:head><title>Invoice {invoice.invoiceNumber} · ERP Penerbitan</title></svelte:head>

<svelte:window
	onload={() => {
		if (data.autoPrint) setTimeout(() => window.print(), 300);
	}}
/>

<div class="min-h-screen bg-paper text-ink-900 dark:bg-ink-950 dark:text-ink-100">
	<div
		class="no-print sticky top-0 z-10 border-b border-ink-200/80 bg-paper/90 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-950/90 sm:px-8"
	>
		<div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
			<a href={data.backHref} class="btn-secondary !py-1.5 !text-xs">
				<ArrowLeft class="size-3.5" /> Kembali
			</a>
			<button type="button" class="btn-primary !py-1.5 !text-xs" onclick={() => window.print()}>
				<Printer class="size-3.5" /> Cetak / simpan PDF
			</button>
		</div>
	</div>

	<main class="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
		<!-- Kop -->
		<header class="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-5 dark:border-ink-800">
			<div>
				<p class="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400">
					Penerbit · ERP
				</p>
				<p class="mt-1 text-sm font-semibold">Penerbitan Buku Independen</p>
				<p class="mt-0.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
					Layanan penerbitan, produksi, dan distribusi buku.
				</p>
			</div>
			<div class="text-right">
				<p class="font-mono text-lg font-semibold tracking-tight">{invoice.invoiceNumber}</p>
				<p class="text-[11px] text-ink-500 dark:text-ink-400">
					{INVOICE_KIND[invoice.kind] ?? invoice.kind}
				</p>
				<p class="mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide
					{invoice.status === 'PAID'
					? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
					: invoice.status === 'OVERDUE'
						? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
						: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'}">
					{statusOf(INVOICE_STATUS, invoice.status).label}
				</p>
			</div>
		</header>

		<!-- Pihak & tanggal -->
		<div class="mt-5 grid gap-5 text-xs sm:grid-cols-2">
			<div>
				<p class="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-400">Ditagihkan kepada</p>
				<p class="mt-1 text-sm font-medium">{invoice.authorName ?? '—'}</p>
				<p class="text-ink-500 dark:text-ink-400">{invoice.authorEmail ?? '—'}</p>
			</div>
			<dl class="space-y-1 sm:text-right">
				<div class="flex justify-between gap-3 sm:justify-end">
					<dt class="text-ink-500 dark:text-ink-400">Diterbitkan</dt>
					<dd class="font-medium">{formatDate(invoice.createdAt)}</dd>
				</div>
				<div class="flex justify-between gap-3 sm:justify-end">
					<dt class="text-ink-500 dark:text-ink-400">Jatuh tempo</dt>
					<dd class="font-medium">{formatDate(invoice.dueDate)}</dd>
				</div>
				<div class="flex justify-between gap-3 sm:justify-end">
					<dt class="text-ink-500 dark:text-ink-400">Nomor order</dt>
					<dd class="font-mono">{invoice.orderNumber}</dd>
				</div>
				<div class="flex justify-between gap-3 sm:justify-end">
					<dt class="text-ink-500 dark:text-ink-400">Rujukan transfer</dt>
					<dd class="font-mono">{reference}</dd>
				</div>
			</dl>
		</div>

		<!-- Rincian -->
		<table class="doc-table mt-7">
			<caption class="sr-only">Rincian tagihan invoice {invoice.invoiceNumber}</caption>
			<thead>
				<tr>
					<th scope="col">Uraian</th>
					<th scope="col" class="text-right!">Jumlah</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>
						<p class="font-medium">
							{INVOICE_KIND[invoice.kind] ?? invoice.kind} — {invoice.projectTitle ??
								invoice.bookTitle ??
								invoice.orderNumber}
						</p>
						<p class="text-[10px] text-ink-500 dark:text-ink-400">
							{invoice.description ?? `Paket ${invoice.packageName}`}
							{#if invoice.milestoneNum !== null}
								· {invoice.milestoneNum}% dari nilai kontrak
							{/if}
						</p>
					</td>
					<td class="text-right font-mono tabular-nums">{formatIDR(invoice.amountNum)}</td>
				</tr>
			</tbody>
			<tfoot>
				{#if invoice.paidAmountNum > 0}
					<tr>
						<th scope="row" class="text-left font-normal text-ink-500">Sudah dibayar</th>
						<td class="text-right font-mono tabular-nums">−{formatIDR(invoice.paidAmountNum)}</td>
					</tr>
				{/if}
				<tr>
					<th scope="row" class="text-left">Sisa tagihan</th>
					<td class="text-right font-mono text-sm font-semibold tabular-nums">
						{formatIDR(invoice.outstanding)}
					</td>
				</tr>
			</tfoot>
		</table>

		{#if data.payments.length > 0}
			<section class="mt-7">
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
					Riwayat pembayaran
				</h2>
				<table class="doc-table">
					<caption class="sr-only">Riwayat pembayaran invoice {invoice.invoiceNumber}</caption>
					<thead>
						<tr>
							<th scope="col">Tanggal</th>
							<th scope="col">Metode</th>
							<th scope="col">Rujukan</th>
							<th scope="col" class="text-right!">Nominal</th>
						</tr>
					</thead>
					<tbody>
						{#each data.payments as payment (payment.id)}
							<tr>
								<td>{formatDate(payment.paidAt)}</td>
								<td>{payment.method}</td>
								<td class="font-mono text-[10px]">{payment.reference ?? '—'}</td>
								<td class="text-right font-mono tabular-nums">{formatIDR(payment.amountNum)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		{#if invoice.status !== 'PAID' && invoice.status !== 'VOID'}
			<section class="mt-7 rounded-lg border border-ink-200 px-4 py-3 text-[11px] leading-relaxed dark:border-ink-800">
				<p class="font-medium">Cara pembayaran</p>
				<p class="mt-1 text-ink-500 dark:text-ink-400">
					Transfer ke rekening penerbit, lalu cantumkan <span class="font-mono">{reference}</span>
					pada berita transfer. Setelah dana masuk, tim keuangan memverifikasi dan status invoice
					berubah menjadi Lunas. Simpan dokumen ini sebagai bukti pengajuan.
				</p>
			</section>
		{/if}

		<footer class="mt-8 border-t border-ink-200 pt-3 text-[10px] text-ink-400 dark:border-ink-800">
			Dicetak {printedAt}. Dokumen ini dihasilkan otomatis dari ERP Penerbitan; angka diambil
			langsung dari invoice, bukan salinan manual.
		</footer>
	</main>
</div>
