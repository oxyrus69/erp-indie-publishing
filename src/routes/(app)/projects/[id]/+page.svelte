<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import TaskComments from '$lib/components/TaskComments.svelte';
	import ProjectFiles from '$lib/components/ProjectFiles.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import {
		BINDING_LABEL,
		COVER_STAGE,
		EDITORIAL_STAGE,
		INVOICE_KIND,
		INVOICE_STATUS,
		LAMINATION_LABEL,
		LEGAL_STAGE,
		PAPER_LABEL,
		PRINT_STAGE,
		PROJECT_STATUS,
		SPECIALTY_LABEL,
		TASK_STATUS,
		TRACK_LABEL,
		formatDate,
		formatDateTime,
		formatIDR,
		statusOf
	} from '$lib/ui';
	import {
		BadgeCheck,
		FileText,
		Image,
		Printer,
		Receipt,
		ShoppingCart,
		UserPlus,
		Wallet
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();

	const project = $derived(data.project);
	const outstanding = $derived(data.invoices.filter((i) => i.status !== 'PAID' && i.status !== 'VOID'));
	const paidTotal = $derived(
		data.invoices.reduce((acc, i) => acc + Number.parseFloat(i.paidAmount ?? '0'), 0)
	);
	const progressPct = $derived(
		project.totalAmount && Number.parseFloat(project.totalAmount) > 0
			? Math.min(100, Math.round((paidTotal / Number.parseFloat(project.totalAmount)) * 100))
			: 0
	);

	const TRACK_ORDER = ['EDITORIAL', 'LAYOUT', 'COVER', 'LEGAL', 'PRINT'] as const;

	const tasksByTrack = $derived(
		TRACK_ORDER.map((track) => ({
			track,
			tasks: data.tasks.filter((t) => t.track === track)
		})).filter((g) => g.tasks.length > 0)
	);

	/* --------------------------- Handler form --------------------------- */

	const approveSubmit = forms.make({
		key: 'approve',
		successTitle: 'Task disetujui',
		errorTitle: 'Gagal menyetujui task',
		keepValues: true,
		confirm: ({ formData }) => {
			const task = data.tasks.find((t) => t.id === String(formData.get('taskId') ?? ''));
			if (!task) return null;
			const fee =
				task.feeStructure === 'PER_PAGE_RATE'
					? (Number.parseFloat(task.perPageRate ?? '0') || 0) * Math.max(0, task.pageCount ?? 0)
					: Number.parseFloat(task.flatFee ?? '0') || 0;
			return {
				title: `Setujui "${task.title}" atas nama penulis?`,
				confirmLabel: 'Ya, setujui',
				facts: [
					{ label: 'Proyek', value: project.title },
					{ label: 'Task', value: task.title },
					{ label: 'Tahap', value: TRACK_LABEL[task.track] ?? task.track },
					{ label: 'Komisi freelancer', value: formatIDR(fee) }
				],
				note: 'Persetujuan atas nama penulis bersifat permanen: task menjadi Disetujui, komisi masuk ke dompet freelancer, dan tahap berikutnya bisa terbuka otomatis.'
			};
		}
	});

	const assignSubmit = forms.make({
		key: 'assign',
		successTitle: 'Task ditugaskan',
		errorTitle: 'Gagal menugaskan',
		onSuccess: () => closeDetails(),
		confirm: ({ formData }) => {
			const freelancerId = String(formData.get('freelancerId') ?? '');
			const freelancer = data.freelancers.find((f) => f.id === freelancerId);
			const task = data.tasks.find((t) => t.id === String(formData.get('taskId') ?? ''));
			const structure = String(formData.get('feeStructure') ?? 'FLAT_FEE');
			const flatFee = Number(formData.get('flatFee') ?? 0);
			const perPageRate = Number(formData.get('perPageRate') ?? 0);
			if (!freelancer || !task) return null;
			const projected =
				structure === 'PER_PAGE_RATE'
					? perPageRate * Math.max(0, task.pageCount ?? project.pageCount ?? 0)
					: flatFee;

			return {
				title: `Tugaskan ${freelancer.fullName}?`,
				confirmLabel: 'Ya, tugaskan',
				facts: [
					{ label: 'Proyek', value: project.title },
					{ label: 'Task', value: task.title },
					{ label: 'Freelancer', value: freelancer.fullName },
					{
						label: 'Fee',
						value:
							structure === 'PER_PAGE_RATE'
								? `${formatIDR(perPageRate)} × ${task.pageCount ?? project.pageCount ?? 0} hlm = ${formatIDR(projected)}`
								: `${formatIDR(flatFee)} flat`
					},
					{ label: 'Deadline', value: String(formData.get('deadline') ?? '') || 'Tanpa tenggat' }
				],
				note: 'Task langsung berstatus Dikerjakan dan freelancer bisa mengirim hasilnya. Struktur fee menjadi dasar komisi saat penulis menyetujui.'
			};
		}
	});

	const specsSubmit = forms.make({
		key: 'specs',
		successTitle: 'Spesifikasi disimpan',
		errorTitle: 'Gagal menyimpan spesifikasi',
		keepValues: true
	});

	/** Konsekuensi verifikasi per jenis invoice — dibaca pengguna di dialog. */
	const PAY_CONSEQUENCE: Record<string, string> = {
		DOWN_PAYMENT:
			'Membuka pipeline produksi: lima task otomatis dibuat dan track editorial, tata letak, serta cover langsung berjalan.',
		FINAL_SETTLEMENT:
			'Membuka track ISBN dan cetak, menandai order lunas, serta membuka file resolusi tinggi setelah cover dan tata letak disetujui.',
		EXTRA_REVISION: 'Membuka kembali task yang ditunda dan menambah satu kuota revisi untuk penulis.',
		PRINT_ADDON: 'Membuka track cetak agar order cetak dapat dibuat.',
		ADDON_SERVICE: 'Mencatat pembayaran layanan tambahan pada order ini.'
	};

	const paySubmit = forms.make({
		key: 'pay-invoice',
		successTitle: 'Pembayaran terverifikasi',
		errorTitle: 'Verifikasi gagal',
		keepValues: true,
		confirm: ({ formData }) => {
			const invoice = data.invoices.find((i) => i.id === String(formData.get('invoiceId') ?? ''));
			if (!invoice) return null;
			const remaining = Math.max(
				0,
				Number.parseFloat(invoice.amount) - Number.parseFloat(invoice.paidAmount ?? '0')
			);
			return {
				title: `Verifikasi lunas ${invoice.invoiceNumber}?`,
				confirmLabel: 'Ya, verifikasi lunas',
				facts: [
					{ label: 'Invoice', value: invoice.invoiceNumber },
					{ label: 'Jenis', value: INVOICE_KIND[invoice.kind] ?? invoice.kind },
					{ label: 'Nominal', value: formatIDR(remaining) },
					{ label: 'Proyek', value: project.title }
				],
				note: `${
					PAY_CONSEQUENCE[invoice.kind] ?? 'Status invoice akan menjadi Lunas.'
				} Tindakan ini permanen dan tidak bisa dibatalkan dari aplikasi.`
			};
		}
	});

	const printSubmit = forms.make({
		key: 'print',
		successTitle: 'Order cetak dibuat',
		errorTitle: 'Gagal membuat order cetak',
		confirm: ({ formData }) => {
			const quantity = Number(formData.get('quantity') ?? 0);
			const authorCopies = Number(formData.get('authorCopies') ?? 0);
			if (!Number.isFinite(quantity) || quantity < 1) return null;
			return {
				title: `Antrekan cetak ${quantity} eksemplar?`,
				confirmLabel: 'Ya, hitung HPP & antrekan',
				facts: [
					{ label: 'Proyek', value: project.title },
					{ label: 'Jumlah cetak', value: `${quantity} eksemplar` },
					{ label: 'Hak penulis', value: `${authorCopies} eksemplar` },
					{ label: 'Masuk gudang', value: `${Math.max(0, quantity - authorCopies)} eksemplar` }
				],
				note: 'HPP dihitung dari spesifikasi tersimpan dan langsung tercatat sebagai biaya di buku kas. Order cetak tidak bisa dihapus dari halaman ini.'
			};
		}
	});

	const saleSubmit = forms.make({
		key: 'sale',
		successTitle: 'Penjualan tercatat',
		errorTitle: 'Gagal mencatat penjualan',
		confirm: ({ formData }) => {
			const quantity = Number(formData.get('quantity') ?? 0);
			if (!Number.isFinite(quantity) || quantity < 1) return null;
			const unitPrice = String(formData.get('unitPrice') ?? '').trim();
			return {
				title: `Catat penjualan ${quantity} eksemplar?`,
				confirmLabel: 'Ya, catat penjualan',
				facts: [
					{ label: 'Proyek', value: project.title },
					{ label: 'Jumlah', value: `${quantity} eksemplar` },
					{
						label: 'Harga satuan',
						value: unitPrice ? formatIDR(Number(unitPrice)) : 'Harga retail tersimpan'
					},
					{
						label: 'Kanal',
						value: String(formData.get('channel') ?? 'DIRECT_WEB').replace('_', ' ').toLowerCase()
					}
				],
				note: 'Stok gudang berkurang dan royalti penulis dikreditkan langsung ke dompetnya. Penjualan yang sudah dicatat tidak bisa dibatalkan dari halaman ini.'
			};
		}
	});

	/*
	 * Form penugasan hidup di dalam <details>. Setelah sukses, panelnya ditutup
	 * supaya pengguna tidak melihat form kosong yang seolah belum terkirim.
	 */
	function closeDetails(): void {
		const open = document.querySelectorAll<HTMLDetailsElement>('details[open]');
		for (const el of open) el.open = false;
	}

	function money(v: string | number | null | undefined) {
		return formatIDR(v);
	}

	/**
	 * `payoutAmount` baru terisi saat task disetujui, jadi task yang masih
	 * berjalan akan tampil Rp 0 bila memakai kolom itu. Hitung dari struktur
	 * fee dengan rumus yang sama seperti saat approval.
	 */
	function feeOf(task: PageData['tasks'][number]): number {
		if (task.isCommissionCredited) return Number.parseFloat(task.payoutAmount ?? '0') || 0;
		return task.feeStructure === 'PER_PAGE_RATE'
			? (Number.parseFloat(task.perPageRate ?? '0') || 0) * Math.max(0, task.pageCount ?? 0)
			: Number.parseFloat(task.flatFee ?? '0') || 0;
	}
</script>

<svelte:head><title>{project.title} · ERP Penerbitan</title></svelte:head>

<!-- ══════════════════════════ HEADER ══════════════════════════ -->
<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
				<a
					href="/projects"
					class="rounded-sm text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
				>
					Proyek
				</a>
				<span>/</span>
				<span class="font-mono">{project.orderNumber}</span>
			</div>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">{project.title}</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				{project.subtitle ? `${project.subtitle} · ` : ''}{project.authorName}
				{#if project.authorEmail}<span class="text-ink-400">({project.authorEmail})</span>{/if}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<StatusBadge {...statusOf(PROJECT_STATUS, project.status)} />
			<span class="badge border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300">
				{project.packageName}
			</span>
			{#if project.isFullyPaid}
				<span class="badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
					Lunas
				</span>
			{:else}
				<span class="badge border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
					Belum Lunas
				</span>
			{/if}
		</div>
	</div>
</header>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
	<!-- ══════════════════════ LEFT COLUMN ══════════════════════ -->
	<div class="space-y-6">
		<!-- PIPELINE TRACKS -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Pipeline Produksi Paralel</h2>
					<p class="text-xs text-ink-500 dark:text-ink-400">
						Tiga jalur berjalan bersamaan sejak DP terverifikasi.
					</p>
				</div>
			</div>
			<div class="grid gap-px bg-ink-100 dark:bg-ink-800 sm:grid-cols-2 lg:grid-cols-4">
				{#each [
					{ label: 'Editorial & Layout', map: EDITORIAL_STAGE, stage: project.editorialStage, note: project.layoutApprovedAt ? `Disetujui ${formatDate(project.layoutApprovedAt)}` : null },
					{ label: 'Cover Studio', map: COVER_STAGE, stage: project.coverStage, note: project.coverApprovedAt ? `Disetujui ${formatDate(project.coverApprovedAt)}` : null },
					{ label: 'Legal & ISBN', map: LEGAL_STAGE, stage: project.legalStage, note: project.isbn ? `ISBN ${project.isbn}` : null },
					{ label: 'Cetak', map: PRINT_STAGE, stage: project.printStage, note: project.printStage ? null : 'Menunggu pelunasan' }
				] as track (track.label)}
					<div class="bg-white px-4 py-4 dark:bg-ink-900">
						<p class="label">{track.label}</p>
						<div class="mt-2">
							<StatusBadge {...statusOf(track.map, track.stage)} />
						</div>
						{#if track.note}
							<p class="mt-2 font-mono text-[11px] text-ink-400">{track.note}</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>

		<!-- TASKS -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Task & Penugasan Freelancer</h2>
					<p class="text-xs text-ink-500 dark:text-ink-400">
						Komisi otomatis masuk ke dompet freelancer saat penulis menyetujui hasil.
					</p>
				</div>
			</div>

			{#if data.tasks.length === 0}
				<p class="px-5 py-8 text-center text-sm text-ink-500">
					Belum ada task. Task dibuat otomatis setelah invoice DP terverifikasi.
				</p>
			{:else}
				<div class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each tasksByTrack as group (group.track)}
						<div class="px-5 py-3">
							<p class="label">{TRACK_LABEL[group.track] ?? group.track}</p>
						</div>
						{#each group.tasks as task (task.id)}
							<article class="px-5 pb-5">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-2">
											<h3 class="text-sm font-medium">{task.title}</h3>
											<StatusBadge {...statusOf(TASK_STATUS, task.status)} />
											{#if !task.isUnlocked}
												<span class="badge border-ink-200 bg-ink-50 text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
													Terkunci
												</span>
											{/if}
										</div>
										{#if task.description}
											<p class="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
												{task.description}
											</p>
										{/if}
										<p class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
											<span>
												Freelancer:
												{#if task.assigneeName}
													<span class="font-medium text-ink-800 dark:text-ink-200">{task.assigneeName}</span>
													{#if task.assigneeSpecialty}
														<span class="text-ink-400">· {SPECIALTY_LABEL[task.assigneeSpecialty] ?? task.assigneeSpecialty}</span>
													{/if}
												{:else}
													<span class="text-amber-700 dark:text-amber-400">belum ditugaskan</span>
												{/if}
											</span>
											<span>													Fee: <span class="font-mono tabular-nums">{money(feeOf(task))}</span>
												{#if !task.isCommissionCredited && feeOf(task) > 0}
													<span class="text-ink-400">estimasi</span>
												{/if}
												{#if task.feeStructure === 'PER_PAGE_RATE'}
													<span class="font-mono text-ink-400">({money(task.perPageRate)}/hal)</span>
												{/if}
												{#if task.isCommissionCredited}
													<span class="badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">Komisi masuk</span>
												{/if}
											</span>
											<span class="font-mono">
												Revisi {task.revisionCount}/{task.maxRevisions}
											</span>
											{#if task.deadline}
												<span>Deadline {formatDate(task.deadline)}</span>
											{/if}
										</p>
									</div>

									{#if data.canManage && task.status !== 'COMPLETED'}
										<div class="flex flex-wrap items-center gap-2">
											{#if task.status === 'WAITING_AUTHOR_REVIEW'}
												<form
													method="POST"
													action="?/approve-on-behalf"
													use:enhance={approveSubmit}
													data-action="approve-{task.id}"
												>
													<input type="hidden" name="taskId" value={task.id} />
													<input type="hidden" name="authorId" value={project.authorId} />
													<SubmitButton
														class="btn-primary !py-1.5 !text-xs"
														busy={forms.isBusy(`approve-${task.id}`)}
														busyLabel="Menyetujui…"
													>
														<BadgeCheck class="size-3.5" /> Setujui
													</SubmitButton>
												</form>
											{/if}
											<details class="w-full sm:w-auto">
												<summary class="btn-secondary !py-1.5 !text-xs cursor-pointer list-none">
													<UserPlus class="size-3.5" /> Tugaskan
												</summary>
												<form
													method="POST"
													action="?/assign-task"
													use:enhance={assignSubmit}
													data-action="assign-{task.id}"
													class="mt-3 grid gap-2 rounded-lg border border-ink-200 p-3 dark:border-ink-700 sm:grid-cols-2"
												>
													<input type="hidden" name="taskId" value={task.id} />
													<label class="sm:col-span-2">
														<span class="label">Freelancer</span>
														<select class="field mt-1" name="freelancerId" required>
															<option value="">— pilih —</option>
															{#each data.freelancers as f (f.id)}
																<option value={f.id}>
																	{f.fullName}{f.specialty ? ` · ${SPECIALTY_LABEL[f.specialty] ?? f.specialty}` : ''}
																</option>
															{/each}
														</select>
													</label>
													<label>
														<span class="label">Struktur Fee</span>
														<select class="field mt-1" name="feeStructure">
															<option value="FLAT_FEE">Flat</option>
															<option value="PER_PAGE_RATE">Per Halaman</option>
														</select>
													</label>
													<label>
														<span class="label">Deadline</span>
														<input class="field mt-1" type="date" name="deadline" />
													</label>
													<label>
														<span class="label">Fee Flat (Rp)</span>
														<input class="field mt-1 font-mono" type="number" name="flatFee" min="0" step="1000" placeholder="0" />
													</label>
													<label>
														<span class="label">Tarif / halaman (Rp)</span>
														<input class="field mt-1 font-mono" type="number" name="perPageRate" min="0" step="500" placeholder="0" />
													</label>
													<SubmitButton
														class="btn-primary sm:col-span-2"
														busy={forms.isBusy(`assign-${task.id}`)}
														busyLabel="Menyimpan penugasan…"
													>
														Simpan penugasan
													</SubmitButton>
												</form>
											</details>
										</div>
									{/if}
								</div>

								{#if task.revisionCount > 0}
									<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
										<p class="text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
											Kuota revisi {task.revisionCount >= task.maxRevisions ? 'habis' : `tersisa ${task.maxRevisions - task.revisionCount}`}
										</p>
										{#if task.revisionCount >= task.maxRevisions}
											<p class="mt-1 text-xs text-amber-800 dark:text-amber-300">
												Permintaan revisi berikutnya otomatis membuat invoice add-on
												<span class="font-mono">{money(task.extraRevisionFee)}</span>.
											</p>
										{/if}
									</div>
								{/if}

								<TaskComments
									taskId={task.id}
									comments={task.comments}
									canComment={data.canComment}
									canInternal={data.canInternal}
								/>
							</article>
						{/each}
					{/each}
				</div>
			{/if}
		</section>

		<!-- FILE ASSETS -->
		<ProjectFiles
			projectId={project.id}
			files={data.assets}
			canUpload={data.canManage}
			highResUnlocked={project.highResUnlocked}
			kinds={[
				{ value: 'MANUSCRIPT', label: 'Naskah' },
				{ value: 'LAYOUT_PDF', label: 'PDF Layout' },
				{ value: 'COVER_DRAFT', label: 'Draft Cover' },
				{ value: 'COVER_FINAL', label: 'Cover Final' },
				{ value: 'ISBN_BARCODE', label: 'Barcode ISBN' },
				{ value: 'LEGAL_DOC', label: 'Dokumen Legal' }
			]}
		/>

		<!-- REVISIONS -->
		<section class="card">
			<div class="card-header">
				<h2 class="text-sm font-semibold">Riwayat Revisi</h2>
			</div>
			{#if data.revisions.length === 0}
				<p class="px-5 py-8 text-center text-sm text-ink-500">Belum ada revisi.</p>
			{:else}
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.revisions as rev (rev.id)}
						<li class="px-5 py-3">
							<div class="flex items-center justify-between gap-2">
								<p class="text-xs font-medium">
									Revisi #{rev.revisionNo}
									{#if rev.isChargeable}
										<span class="badge ml-1 border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300">Berbayar</span>
									{/if}
								</p>
								<span class="font-mono text-[11px] text-ink-400">{formatDateTime(rev.createdAt)}</span>
							</div>
							<p class="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{rev.notes}</p>
							<p class="mt-1 text-[11px] text-ink-400">
								oleh {rev.requestedByName ?? 'Penulis'} · status {rev.status}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<!-- ══════════════════════ RIGHT COLUMN ══════════════════════ -->
	<div class="space-y-6">
		<!-- FINANCE -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="flex items-center gap-2 text-sm font-semibold">
						<Receipt class="size-4" /> Keuangan
					</h2>
					<p class="text-xs text-ink-500 dark:text-ink-400">Skema pembayaran bertahap</p>
				</div>
			</div>
			<div class="px-5 py-4">
				<p class="font-mono text-lg tabular-nums">{money(paidTotal)}</p>
				<p class="text-xs text-ink-500">dari {money(project.totalAmount)}</p>
				<ProgressBar
					class="mt-2"
					value={progressPct}
					label="Pembayaran order"
					tone={progressPct >= 100 ? 'done' : 'primary'}
				/>
				{#if outstanding.length > 0}
					<p class="mt-3 text-xs text-amber-800 dark:text-amber-300">
						{outstanding.length} tagihan belum lunas · total
						<span class="font-mono">{money(outstanding.reduce((a, i) => a + Number.parseFloat(i.amount), 0))}</span>
					</p>
				{/if}
			</div>

			<ul class="divide-y divide-ink-100 border-t border-ink-100 dark:divide-ink-800 dark:border-ink-800">
				{#each data.invoices as inv (inv.id)}
					<li class="px-5 py-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-xs font-medium">{INVOICE_KIND[inv.kind] ?? inv.kind}</p>
								<p class="font-mono text-[11px] text-ink-400">{inv.invoiceNumber}</p>
							</div>
							<StatusBadge {...statusOf(INVOICE_STATUS, inv.status)} dot={false} />
						</div>
						<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
							<span class="font-mono text-sm tabular-nums">{money(inv.amount)}</span>
							<div class="flex items-center gap-1.5">
								<a
									href="/invoice/{inv.id}"
									target="_blank"
									rel="noopener"
									class="btn-secondary !px-2 !py-1 !text-[11px]"
									title="Buka invoice siap cetak"
								>
									<Printer class="size-3" /> Invoice
								</a>
								{#if inv.status !== 'PAID' && inv.status !== 'VOID'}
									<form
										method="POST"
										action="?/pay-invoice"
										use:enhance={paySubmit}
										data-action="pay-{inv.id}"
									>
										<input type="hidden" name="invoiceId" value={inv.id} />
										<SubmitButton
											class="btn-secondary !py-1 !text-[11px]"
											busy={forms.isBusy(`pay-${inv.id}`)}
											busyLabel="Memverifikasi…"
										>
											<Wallet class="size-3" /> Verifikasi lunas
										</SubmitButton>
									</form>
								{:else if inv.paidAt}
									<span class="font-mono text-[11px] text-ink-400">{formatDate(inv.paidAt)}</span>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<!-- SPECS -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="flex items-center gap-2 text-sm font-semibold">
						<Printer class="size-4" /> Spesifikasi Cetak
					</h2>
					<p class="text-xs text-ink-500 dark:text-ink-400">Dasar perhitungan HPP</p>
				</div>
			</div>
			<form method="POST" action="?/save-specs" use:enhance={specsSubmit} data-action="specs" class="space-y-3 px-5 py-4">
				<!--
					Versi baris yang sedang dibaca form ini. Server menolak simpan
					bila versi di database sudah berubah (409), jadi dua PM tidak
					bisa saling menimpa tanpa peringatan.
				-->
				<input type="hidden" name="version" value={project.version} />
				<label class="block">
					<span class="label">Jumlah Halaman</span>
					<input class="field mt-1 font-mono" type="number" name="pageCount" min="8" aria-label="Jumlah halaman" value={project.pageCount || ''} required />
				</label>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="label">Ukuran</span>
						<select class="field mt-1" name="bookSize" aria-label="Ukuran buku">
							{#each ['A5', 'B5', 'UNESCO', 'A4', 'CUSTOM'] as s (s)}
								<option value={s} selected={project.bookSize === s}>{s}</option>
							{/each}
						</select>
					</label>
					<label class="block">
						<span class="label">Kertas</span>
						<select class="field mt-1" name="paperType" aria-label="Jenis kertas">
							{#each ['BOOKPAPER', 'HVS', 'ART_PAPER'] as p (p)}
								<option value={p} selected={project.paperType === p}>{PAPER_LABEL[p]}</option>
							{/each}
						</select>
					</label>
					<label class="block">
						<span class="label">Jilid</span>
						<select class="field mt-1" name="binding" aria-label="Jenis jilid">
							{#each ['PERFECT_BINDING', 'SPIRAL', 'HARDCOVER', 'STAPLE'] as b (b)}
								<option value={b} selected={project.binding === b}>{BINDING_LABEL[b]}</option>
							{/each}
						</select>
					</label>
					<label class="block">
						<span class="label">Laminasi</span>
						<select class="field mt-1" name="lamination" aria-label="Jenis laminasi">
							{#each ['NONE', 'DOFF', 'GLOSSY'] as l (l)}
								<option value={l} selected={project.lamination === l}>{LAMINATION_LABEL[l]}</option>
							{/each}
						</select>
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="label">Genre</span>
						<input class="field mt-1" name="genre" aria-label="Genre buku" value={project.genre ?? ''} placeholder="Fiksi, Bisnis…" />
					</label>
					<label class="block">
						<span class="label">ISBN</span>
						<input class="field mt-1 font-mono" name="isbn" aria-label="Nomor ISBN" value={project.isbn ?? ''} placeholder="978-…" />
					</label>
				</div>
				<label class="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
					<input type="checkbox" name="isFullColor" checked={project.isFullColor} aria-label="Cetak full color" class="rounded border-ink-300" />
					Cetak full color (mempengaruhi HPP)
				</label>
				{#if data.canManage}
					<SubmitButton
						class="btn-primary w-full !py-1.5 !text-xs"
						busy={forms.isBusy('specs')}
						busyLabel="Menyimpan…"
					>
						Simpan spesifikasi
					</SubmitButton>
				{:else}
					<p class="text-[11px] text-ink-400">Hanya Project Manager dapat mengubah spesifikasi.</p>
				{/if}
			</form>
		</section>

		<!-- PRINT RUNS -->
		<section class="card">
			<div class="card-header">
				<h2 class="text-sm font-semibold">Antrean Cetak</h2>
				<span class="badge border-ink-200 bg-ink-50 text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
					{data.printRuns.length} order
				</span>
			</div>
			{#if data.printRuns.length > 0}
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.printRuns as run (run.id)}
						<li class="px-5 py-3">
							<div class="flex items-center justify-between gap-2">
								<p class="font-mono text-xs">{run.quantity} eksemplar</p>
								<StatusBadge {...statusOf(PRINT_STAGE, run.stage)} dot={false} />
							</div>
							<p class="mt-1 text-[11px] text-ink-400">
								HPP {money(run.costPerUnit)}/eks · total {money(run.totalCost)}
							</p>
							<p class="text-[11px] text-ink-400">
								{run.authorCopies} hak penulis · {run.warehouseCopies} ke gudang
							</p>
						</li>
					{/each}
				</ul>
			{/if}
			{#if data.canManage}
				<form method="POST" action="?/create-print-run" use:enhance={printSubmit} data-action="print" class="space-y-3 border-t border-ink-100 px-5 py-4 dark:border-ink-800">
					<div class="grid grid-cols-2 gap-3">
						<label class="block">
							<span class="label">Jumlah Cetak</span>
							<input class="field mt-1 font-mono" type="number" name="quantity" min="1" value="100" required />
						</label>
						<label class="block">
							<span class="label">Hak Penulis</span>
							<input class="field mt-1 font-mono" type="number" name="authorCopies" min="0" value="2" />
						</label>
					</div>
					<SubmitButton
						class="btn-secondary w-full !py-1.5 !text-xs"
						busy={forms.isBusy('print')}
						busyLabel="Menghitung HPP…"
					>
						Hitung HPP & antrekan cetak
					</SubmitButton>
				</form>
			{/if}
		</section>

		<!-- SALES -->
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="flex items-center gap-2 text-sm font-semibold">
						<ShoppingCart class="size-4" /> Penjualan & Royalti
					</h2>
					<p class="text-xs text-ink-500 dark:text-ink-400">
						Royalti penulis {project.authorRoyaltyPct}% dari margin bersih
					</p>
				</div>
			</div>
			<div class="grid grid-cols-2 divide-x divide-ink-100 border-b border-ink-100 dark:divide-ink-800 dark:border-ink-800">
				<div class="px-5 py-3">
					<p class="label">Stok Gudang</p>
					<p class="value">{data.inventory?.onHand ?? 0}</p>
				</div>
				<div class="px-5 py-3">
					<p class="label">Terjual</p>
					<p class="value">{data.inventory?.soldTotal ?? 0}</p>
				</div>
			</div>

			{#if data.sales.length === 0}
				<p class="px-5 py-6 text-center text-xs text-ink-500">Belum ada penjualan tercatat.</p>
			{:else}
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.sales as sale (sale.id)}
						<li class="flex items-center justify-between gap-2 px-5 py-2.5">
							<div>
								<p class="text-xs font-medium">
									{sale.quantity}× <span class="text-ink-400">{sale.channel.replace('_', ' ').toLowerCase()}</span>
								</p>
								<p class="font-mono text-[11px] text-ink-400">{formatDate(sale.soldAt)}</p>
							</div>
							<span class="font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
								+{money(sale.netRoyalty)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			<form method="POST" action="?/record-sale" use:enhance={saleSubmit} data-action="sale" class="space-y-3 border-t border-ink-100 px-5 py-4 dark:border-ink-800">
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="label">Qty</span>
						<input class="field mt-1 font-mono" type="number" name="quantity" min="1" value="1" required />
					</label>
					<label class="block">
						<span class="label">Kanal</span>
						<select class="field mt-1" name="channel">
							<option value="DIRECT_WEB">Web Langsung</option>
							<option value="MARKETPLACE">Marketplace</option>
							<option value="RESELLER">Reseller</option>
							<option value="EVENT">Event</option>
						</select>
					</label>
				</div>
				<label class="block">
					<span class="label">Harga Satuan (opsional)</span>
					<input class="field mt-1 font-mono" type="number" name="unitPrice" min="0" step="1000" placeholder="Harga retail" />
				</label>
				<SubmitButton
					class="btn-primary w-full !py-1.5 !text-xs"
					busy={forms.isBusy('sale')}
					busyLabel="Mencatat…"
				>
					Catat penjualan
				</SubmitButton>
			</form>
		</section>
	</div>
</div>
