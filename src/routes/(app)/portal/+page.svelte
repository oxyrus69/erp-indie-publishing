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
		TASK_STATUS,
		TONE_CLASS,
		TONE_DOT,
		TRACK_LABEL,
		formatDate,
		formatIDR,
		statusOf,
		type Tone
	} from '$lib/ui';
	import {
		AlertTriangle,
		ArrowRight,
		BadgeCheck,
		BookOpen,
		CheckCircle2,
		CreditCard,
		FileText,
		History,
		ImageIcon,
		MessageSquare,
		Package,
		PenLine,
		Printer,
		Wallet
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	type FormState = { ok?: boolean; message?: string } | null;

	let { data }: { data: PageData } = $props();

	let activeId = $state<string | null>(null);
	let tab = $state<'books' | 'wallet'>('books');
	let withdrawOpen = $state(false);
	let amountInput = $state('');
	let revisionFor = $state<string | null>(null);
	let revisionNotes = $state('');

	const forms = createFormHandler();

	const approveSubmit = forms.make({
		key: 'approve-task',
		successTitle: 'Hasil disetujui',
		errorTitle: 'Gagal menyetujui',
		keepValues: true,
		confirm: ({ formData }) => {
			const taskId = String(formData.get('taskId') ?? '');
			const task = findTask(taskId);
			if (!task) return null;

			return {
				title: `Setujui hasil ${task.title}?`,
				confirmLabel: 'Ya, setujui hasil',
				facts: [
					{ label: 'Buku', value: active?.title ?? '—' },
					{ label: 'Pekerjaan', value: task.title },
					{ label: 'Tahap', value: TRACK_LABEL[task.track] ?? task.track }
				],
				note: 'Persetujuan bersifat permanen. Komisi freelancer langsung masuk ke dompetnya, dan tahap lanjutan bisa terbuka otomatis. Perubahan tidak bisa dibatalkan dari portal.'
			};
		}
	});

	/** Cari task di buku yang sedang aktif. */
	function findTask(taskId: string) {
		return active?.tasks.find((t) => t.id === taskId) ?? null;
	}

	const revisionSubmit = forms.make({
		key: 'request-revision',
		successTitle: 'Revisi terkirim',
		errorTitle: 'Revisi gagal dikirim',
		keepValues: true,
		onSuccess: () => {
			revisionFor = null;
			revisionNotes = '';
		}
	});

	const withdrawSubmit = forms.make({
		key: 'withdraw',
		successTitle: 'Pengajuan terkirim',
		errorTitle: 'Pengajuan gagal',
		onSuccess: () => {
			withdrawOpen = false;
			amountInput = '';
		},
		confirm: ({ formData }) => {
			const amount = Number.parseInt(String(formData.get('amount') ?? '').replace(/[^\d]/g, ''), 10);
			const bank = String(formData.get('bankName') ?? '').trim();
			const holder = String(formData.get('bankAccountName') ?? '').trim();
			const account = String(formData.get('bankAccountNumber') ?? '').trim();
			if (!Number.isFinite(amount) || amount <= 0) return null;

			return {
				title: 'Kirim pengajuan penarikan royalti?',
				confirmLabel: 'Ya, ajukan penarikan',
				facts: [
					{ label: 'Nominal', value: formatIDR(amount) },
					{ label: 'Bank', value: bank || '—' },
					{ label: 'Atas nama', value: holder || '—' },
					{ label: 'No. rekening', value: account || '—' },
					{ label: 'Royalti tersedia', value: formatIDR(data.wallet.availableNum) }
				],
				note: 'Nominal ditahan dari saldo royalti dan menunggu persetujuan finance. Rekening tujuan tidak bisa diubah setelah pengajuan dikirim.'
			};
		}
	});

	const active = $derived(
		data.projects.find((p) => p.projectId === (activeId ?? data.projects[0]?.projectId)) ?? null
	);

	/** Label spesifikasi yang aman terhadap kolom nullable hasil left join. */
	function specLabel(map: Record<string, string>, value: string | null): string {
		if (!value) return '—';
		return map[value] ?? value;
	}

	const WITHDRAWAL_STATUS: Record<string, { label: string; tone: Tone }> = {
		REQUESTED: { label: 'Diajukan', tone: 'review' },
		APPROVED: { label: 'Disetujui', tone: 'progress' },
		PAID: { label: 'Dibayar', tone: 'done' },
		REJECTED: { label: 'Ditolak', tone: 'danger' }
	};

	const ROYALTY_STATUS: Record<string, { label: string; tone: Tone }> = {
		PENDING: { label: 'Tertahan', tone: 'review' },
		AVAILABLE: { label: 'Tersedia', tone: 'done' },
		WITHDRAWN: { label: 'Ditarik', tone: 'neutral' },
		CANCELLED: { label: 'Dibatalkan', tone: 'neutral' }
	};

	const LEDGER_LABEL: Record<string, string> = {
		ROYALTY: 'Royalti penjualan',
		WITHDRAWAL: 'Penarikan',
		ADJUSTMENT: 'Penyesuaian',
		TASK_COMMISSION: 'Komisi',
		REVISION_BONUS: 'Bonus revisi'
	};

	const FILE_LABEL: Record<string, string> = {
		MANUSCRIPT: 'Naskah',
		COVER_DRAFT: 'Draft cover',
		COVER_FINAL: 'Cover final',
		COVER_PREVIEW: 'Preview cover',
		LAYOUT_PDF: 'Layout PDF',
		LAYOUT_PREVIEW: 'Preview layout',
		ISBN_BARCODE: 'Barcode ISBN',
		LEGAL_DOC: 'Dokumen legal',
		CATALOG_THUMB: 'Thumbnail katalog'
	};

	/** Tahapan pipeline yang ditampilkan ke penulis, berurutan. */
	const TIMELINE = [
		{ key: 'edit', label: 'Editorial', icon: PenLine },
		{ key: 'cover', label: 'Cover', icon: ImageIcon },
		{ key: 'legal', label: 'ISBN', icon: BadgeCheck },
		{ key: 'print', label: 'Cetak', icon: Printer }
	] as const;

	function formatBytes(n: number): string {
		if (n <= 0) return '—';
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<svelte:head><title>Buku Saya · ERP Penerbitan</title></svelte:head>

<!-- ══════════════════════════ HEADER ══════════════════════════ -->
<header class="mb-7">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="label">Portal Penulis</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">
				Hai, {data.profile.fullName.split(' ')[0]}
			</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				{data.kpi.activeCount} buku dalam proses · {data.kpi.publishedCount} sudah terbit ·
				{data.kpi.awaitingReview} hasil menunggu persetujuan Anda
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if data.kpi.overdueCount > 0}
				<span class="badge {TONE_CLASS.danger}">
					<AlertTriangle class="size-3" />
					{data.kpi.overdueCount} tagihan jatuh tempo
				</span>
			{/if}
			{#if !data.profile.isActive}
				<span class="badge {TONE_CLASS.warn}">Akun tidak aktif</span>
			{/if}
		</div>
	</div>
</header>

<!-- ══════════════════════════ KPI ══════════════════════════ -->
<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Tagihan Berjalan</p>
			<CreditCard class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.outstanding)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{data.openInvoices.length} invoice belum lunas
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Royalti Tersedia</p>
			<Wallet class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.wallet.availableNum)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{#if data.wallet.pendingNum > 0}
				{formatIDR(data.wallet.pendingNum)} masih tertahan
			{:else}
				Siap ditarik ke rekening
			{/if}
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Total Royalti</p>
			<CheckCircle2 class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.royaltyEarned)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Termasuk yang sudah ditarik
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Eksemplar Tersedia</p>
			<Package class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{data.kpi.copiesOnHand}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Stok gudang siap dijual</p>
	</article>
</section>

<!-- ══════════════════════════ TAB ══════════════════════════ -->
<div class="mb-4 flex flex-wrap items-center gap-1.5">
	{#each [{ key: 'books' as const, label: 'Buku Saya', count: data.projects.length }, { key: 'wallet' as const, label: 'Royalti', count: data.ledger.length }] as t (t.key)}
		<button
			type="button"
			class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
				{tab === t.key
				? 'border-yale-700 bg-yale-700 text-white dark:border-yale-600 dark:bg-yale-600 dark:text-white'
				: 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'}"
			onclick={() => (tab = t.key)}
		>
			{t.label}
			<span class="ml-1 font-mono text-[10px] opacity-60">{t.count}</span>
		</button>
	{/each}
</div>

<!-- ══════════════════════════ BUKU ══════════════════════════ -->
{#if tab === 'books'}
	{#if data.projects.length === 0}
		<section class="card flex flex-col items-center gap-2 px-5 py-16 text-center">
			<BookOpen class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			<p class="text-sm font-medium">Belum ada buku</p>
			<p class="max-w-sm text-xs text-ink-500 dark:text-ink-400">
				Buku muncul di sini setelah tim kami membuat order dan naskah Anda masuk produksi.
			</p>
		</section>
	{:else}
		<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
			<!-- --------------------------- Panel Utama --------------------------- -->
			<div class="space-y-5">
				{#if active}
					<!-- Judul buku -->
					<section class="card overflow-hidden">
						<div
							class="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 dark:border-ink-800"
						>
							<div class="min-w-0">
								<StatusBadge {...statusOf(PROJECT_STATUS, active.status)} />
								<h2 class="mt-2 font-serif text-2xl leading-snug tracking-tight">
									{active.title}
								</h2>
								{#if active.subtitle}
									<p class="text-sm text-ink-500 dark:text-ink-400">{active.subtitle}</p>
								{/if}
								<p class="mt-1 text-[11px] text-ink-400">
									{active.orderNumber} · {active.packageName}
									{#if active.genre}· {active.genre}{/if}
								</p>
							</div>
							<div class="text-right">
								<p class="label">Progres Bayar</p>
								<p class="mt-1 font-mono text-sm tabular-nums">
									{formatIDR(active.paidNum)}
									<span class="text-ink-400">/ {formatIDR(active.totalNum)}</span>
								</p>
								<ProgressBar
									class="mt-1.5 w-28"
									value={active.progressPct}
									label="Pembayaran order"
									showValue={false}
									tone={active.isFullyPaid ? 'done' : 'primary'}
								/>
								{#if active.isFullyPaid}
									<p class="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">Lunas</p>
								{:else}
									<p class="mt-1 text-[10px] text-orange-600 dark:text-orange-400">
										Sisa {formatIDR(active.outstanding)}
									</p>
								{/if}
							</div>
						</div>

						<!-- Timeline pipeline -->
						<dl class="grid gap-px bg-ink-100 sm:grid-cols-2 dark:bg-ink-800">
							{#each TIMELINE as step (step.key)}
								{@const info =
									step.key === 'edit'
										? statusOf(EDITORIAL_STAGE, active.editorialStage)
										: step.key === 'cover'
											? statusOf(COVER_STAGE, active.coverStage)
											: step.key === 'legal'
												? statusOf(LEGAL_STAGE, active.legalStage)
												: statusOf(PRINT_STAGE, active.printStage)}
								<div class="flex items-center justify-between gap-3 bg-white px-5 py-3 dark:bg-ink-900">
									<div class="flex items-center gap-2.5">
										<step.icon class="size-4 text-ink-400" strokeWidth={1.5} />
										<div>
											<dt class="text-xs font-medium">{step.label}</dt>
											<dd class="text-[11px] text-ink-500 dark:text-ink-400">{info.label}</dd>
										</div>
									</div>
									<span class="size-2 rounded-full {TONE_DOT[info.tone]}"></span>
								</div>
							{/each}
						</dl>

						{#if active.synopsis}
							<p class="border-t border-ink-100 px-5 py-3 text-xs leading-relaxed text-ink-600 dark:border-ink-800 dark:text-ink-300">
								{active.synopsis}
							</p>
						{/if}

						<dl
							class="grid gap-x-6 gap-y-2 border-t border-ink-100 px-5 py-4 text-[11px] sm:grid-cols-3 dark:border-ink-800"
						>
							<div>
								<dt class="label">Spesifikasi</dt>
								<dd class="mt-0.5 text-ink-700 dark:text-ink-200">
									{active.pageCount} hlm · {active.bookSize ?? '—'} · {specLabel(PAPER_LABEL, active.paperType)}
								</dd>
							</div>
							<div>
								<dt class="label">Jilid & Laminasi</dt>
								<dd class="mt-0.5 text-ink-700 dark:text-ink-200">
									{specLabel(BINDING_LABEL, active.binding)} · {specLabel(LAMINATION_LABEL, active.lamination)}
								</dd>
							</div>
							<div>
								<dt class="label">ISBN</dt>
								<dd class="mt-0.5 font-mono text-ink-700 dark:text-ink-200">
									{active.isbn ?? 'Belum terbit'}
								</dd>
							</div>
						</dl>
					</section>

					<!-- Antrean persetujuan -->
					{#if active.waitingTasks.length > 0}
						<section class="card border-amber-200/80 dark:border-amber-900/50">
							<div class="card-header !border-amber-100 dark:!border-amber-900/40">
								<div>
									<h3 class="text-sm font-semibold">Menunggu Persetujuan Anda</h3>
									<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
										Periksa hasilnya, lalu setujui atau minta revisi.
									</p>
								</div>
								<span class="badge {TONE_CLASS.review}">{active.waitingTasks.length}</span>
							</div>
							<ul class="divide-y divide-ink-100 dark:divide-ink-800">
								{#each active.waitingTasks as t (t.id)}
									{@const freeLeft = Math.max(0, t.maxRevisions - t.revisionCount)}
									<li class="px-5 py-4">
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
													<span class="badge {TONE_CLASS.neutral}">
														{TRACK_LABEL[t.track] ?? t.track}
													</span>
													<StatusBadge {...statusOf(TASK_STATUS, t.status)} />
												</div>
												<p class="mt-1.5 text-sm font-medium">{t.title}</p>
												{#if t.description}
													<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{t.description}</p>
												{/if}
												<p class="mt-1 text-[11px] text-ink-400">
													Dikirim {formatDate(t.submittedAt)} · revisi {t.revisionCount}/{t.maxRevisions}
													{#if freeLeft === 0}
														· revisi berikutnya berbayar {formatIDR(t.extraRevisionFee)}
													{/if}
												</p>
											</div>
											<div class="flex shrink-0 items-center gap-1.5">
												<form
													method="POST"
													action="?/approve-task"
													use:enhance={approveSubmit}
													data-action="approve-{t.id}"
												>
													<input type="hidden" name="taskId" value={t.id} />
													<SubmitButton
														class="btn-primary !py-1.5 !text-xs"
														busy={forms.isBusy(`approve-${t.id}`)}
														busyLabel="Menyetujui…"
													>
														<CheckCircle2 class="size-3.5" />
														Setujui
													</SubmitButton>
												</form>
												<button
													type="button"
													class="btn-secondary !py-1.5 !text-xs"
													onclick={() => {
														revisionFor = revisionFor === t.id ? null : t.id;
														revisionNotes = '';
													}}
												>
													<MessageSquare class="size-3.5" />
													Revisi
												</button>
											</div>
										</div>

										{#if revisionFor === t.id}
											<form
												method="POST"
												action="?/request-revision"
												use:enhance={revisionSubmit}
												data-action="revise-{t.id}"
												class="mt-3 space-y-2 rounded-lg border border-ink-200 bg-ink-50/60 p-3 dark:border-ink-700 dark:bg-ink-800/40"
											>
												<input type="hidden" name="taskId" value={t.id} />
												<label class="label" for="notes-{t.id}">Catatan revisi</label>
												<textarea
													id="notes-{t.id}"
													name="notes"
													class="field min-h-20"
													rows="3"
													bind:value={revisionNotes}
													placeholder="Contoh: judul terlalu ke bawah, mohon naikkan 2 cm dan ganti warna latar jadi biru navy."
													required
												></textarea>
												<p class="text-[10px] text-ink-500 dark:text-ink-400">
													{#if freeLeft > 0}
														Sisa {freeLeft} revisi gratis. Revisi ini tidak dikenakan biaya.
													{:else}
														Kuota gratis habis — revisi ini membuat invoice
														{formatIDR(t.extraRevisionFee)} dan pekerjaan dijeda sampai lunas.
													{/if}
												</p>
												<div class="flex items-center gap-2">
													<SubmitButton
														class="btn-primary !py-1.5 !text-xs"
														busy={forms.isBusy(`revise-${t.id}`)}
														busyLabel="Mengirim…"
													>
														Kirim Revisi
														<ArrowRight class="size-3.5" />
													</SubmitButton>
													<button
														type="button"
														class="btn-secondary !py-1.5 !text-xs"
														disabled={forms.isBusy(`revise-${t.id}`)}
														onclick={() => (revisionFor = null)}
													>
														Batal
													</button>
												</div>
											</form>
										{/if}
									</li>
								{/each}
							</ul>
						</section>
					{/if}

					<!-- Task & riwayat revisi -->
					<section class="card">
						<div class="card-header">
							<div>
								<h3 class="text-sm font-semibold">Pekerjaan Produksi</h3>
								<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
									Status tiap track beserta catatan revisi yang pernah Anda kirim.
								</p>
							</div>
							<FileText class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
						</div>
						{#if active.tasks.length === 0}
							<p class="px-5 py-10 text-center text-xs text-ink-500 dark:text-ink-400">
								Belum ada task produksi untuk buku ini.
							</p>
						{:else}
							<ul class="divide-y divide-ink-100 dark:divide-ink-800">
								{#each active.tasks as t (t.id)}
									<li class="px-5 py-3">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<div class="flex flex-wrap items-center gap-2">
												<span class="badge {TONE_CLASS.neutral}">
													{TRACK_LABEL[t.track] ?? t.track}
												</span>
												<span class="text-xs font-medium">{t.title}</span>
											</div>
											<StatusBadge {...statusOf(TASK_STATUS, t.status)} dot={false} />
										</div>
										{#if t.revisions.length > 0}
											<ul class="mt-2 space-y-1 border-l-2 border-ink-200 pl-2.5 dark:border-ink-700">
												{#each t.revisions as r (r.id)}
													<li>
														<p class="text-[10px] uppercase tracking-wide text-ink-400">
															Revisi #{r.revisionNo} · {formatDate(r.createdAt)}
															{#if r.isChargeable}· berbayar{/if}
															{#if r.status === 'AWAITING_PAYMENT'}
																· menunggu bayar
															{/if}
														</p>
														<p class="text-xs text-ink-600 dark:text-ink-300">{r.notes}</p>
													</li>
												{/each}
											</ul>
										{/if}

										<TaskComments
											taskId={t.id}
											comments={t.comments}
											canComment={true}
											canInternal={false}
											action="?/comment"
										/>
									</li>
								{/each}
							</ul>
						{/if}
					</section>

					<!-- File -->
					<ProjectFiles
						projectId={active.projectId ?? ''}
						files={active.files}
						canUpload={false}
						highResUnlocked={Boolean(active.highResUnlocked)}
					/>
				{/if}
			</div>

			<!-- --------------------------- Sidebar --------------------------- -->
			<aside class="space-y-5">
				<!-- Pilih buku -->
				<section class="card">
					<div class="card-header">
						<h3 class="text-sm font-semibold">Daftar Buku</h3>
						<span class="font-mono text-[11px] text-ink-400">{data.projects.length}</span>
					</div>
					<ul class="max-h-80 divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
						{#each data.projects as p (p.orderId)}
							<li>
								<button
									type="button"
									class="w-full px-5 py-2.5 text-left transition
										{active?.orderId === p.orderId
									? 'bg-yale-50 dark:bg-yale-950/40'
									: 'hover:bg-ink-50/60 dark:hover:bg-ink-800/30'}"
									onclick={() => {
										activeId = p.projectId;
										revisionFor = null;
									}}
								>
									<p class="truncate text-xs font-medium">{p.title}</p>
									<p class="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-400">
										<span
											class="size-1.5 rounded-full {TONE_DOT[statusOf(PROJECT_STATUS, p.status).tone]}"
										></span>
										{statusOf(PROJECT_STATUS, p.status).label}
										{#if p.waitingTasks.length > 0}
											· {p.waitingTasks.length} perlu review
										{/if}
									</p>
								</button>
							</li>
						{/each}
					</ul>
				</section>

				<!-- Invoice terbuka -->
				<section class="card">
					<div class="card-header">
						<h3 class="text-sm font-semibold">Tagihan</h3>
						<CreditCard class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
					</div>
					{#if data.openInvoices.length === 0}
						<p class="px-5 py-8 text-center text-xs text-ink-500 dark:text-ink-400">
							Tidak ada tagihan terbuka.
						</p>
					{:else}
						<ul class="divide-y divide-ink-100 dark:divide-ink-800">
							{#each data.openInvoices as i (i.id)}
								<li class="px-5 py-2.5">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="truncate text-xs font-medium">
												{INVOICE_KIND[i.kind] ?? i.kind}
											</p>
											<p class="font-mono text-[10px] text-ink-400">{i.invoiceNumber}</p>
											<p
												class="text-[10px] {i.days !== null && i.days < 0
													? 'text-red-600 dark:text-red-400'
													: 'text-ink-400'}"
											>
												{i.days === null
													? 'Tanpa jatuh tempo'
													: i.days < 0
														? `Lewat ${Math.abs(i.days)} hari`
														: `Jatuh tempo ${formatDate(i.dueDate)}`}
											</p>
										</div>
										<div class="shrink-0 text-right">
											<p class="font-mono text-xs tabular-nums">{formatIDR(i.outstanding)}</p>
											<p class="mt-0.5">
												<StatusBadge {...statusOf(INVOICE_STATUS, i.status)} dot={false} />
											</p>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<!-- Status cetak -->
				{#if active?.stock}
					<section class="card">
						<div class="card-header">
							<h3 class="text-sm font-semibold">Stok & Penjualan</h3>
							<Printer class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
						</div>
						<dl class="space-y-2 px-5 py-3 text-xs">
							<div class="flex justify-between">
								<dt class="text-ink-500 dark:text-ink-400">Tersedia</dt>
								<dd class="font-mono tabular-nums">
									{Math.max(0, active.stock.onHand - active.stock.reserved)} eks
								</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-ink-500 dark:text-ink-400">Terjual</dt>
								<dd class="font-mono tabular-nums">{active.stock.soldTotal} eks</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-ink-500 dark:text-ink-400">Harga retail</dt>
								<dd class="font-mono tabular-nums">{formatIDR(active.stock.retailPrice)}</dd>
							</div>
						</dl>
					</section>
				{/if}
			</aside>
		</div>
	{/if}
{/if}

<!-- ══════════════════════════ ROYALTI ══════════════════════════ -->
{#if tab === 'wallet'}
	<div class="grid gap-5 xl:grid-cols-3">
		<div class="min-w-0 space-y-5 xl:col-span-2">
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Saldo Royalti</h2>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							Royalti dihitung dari penjualan bersih buku Anda. Minimum penarikan Rp 100.000.
						</p>
					</div>
					<Wallet class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>

				<dl
					class="grid gap-px border-y border-ink-100 bg-ink-100 sm:grid-cols-3 dark:border-ink-800 dark:bg-ink-800"
				>
					<div class="bg-white px-5 py-3 dark:bg-ink-900">
						<dt class="label">Tersedia</dt>
						<dd class="mt-1 font-mono text-lg tabular-nums">{formatIDR(data.wallet.availableNum)}</dd>
					</div>
					<div class="bg-white px-5 py-3 dark:bg-ink-900">
						<dt class="label">Tertahan</dt>
						<dd class="mt-1 font-mono text-lg tabular-nums">{formatIDR(data.wallet.pendingNum)}</dd>
					</div>
					<div class="bg-white px-5 py-3 dark:bg-ink-900">
						<dt class="label">Sudah Ditarik</dt>
						<dd class="mt-1 font-mono text-lg tabular-nums">{formatIDR(data.wallet.withdrawnNum)}</dd>
					</div>
				</dl>

				<div class="px-5 py-4">
					{#if !withdrawOpen}
						<button
							type="button"
							class="btn-primary !py-1.5 !text-xs"
							disabled={data.wallet.availableNum < data.minimumWithdrawal}
							onclick={() => (withdrawOpen = true)}
						>
							<Wallet class="size-3.5" />
							{data.wallet.availableNum < data.minimumWithdrawal
								? `Saldo belum mencapai ${formatIDR(data.minimumWithdrawal)}`
								: 'Tarik Royalti'}
						</button>
					{:else}
						<form
							method="POST"
							action="?/request-withdrawal"
							use:enhance={withdrawSubmit}
							data-action="withdraw"
							class="space-y-3"
						>
							<div>
								<label class="label" for="royalty-amount">Nominal</label>
								<input
									id="royalty-amount"
									name="amount"
									class="field mt-1 font-mono"
									inputmode="numeric"
									placeholder="1000000"
									bind:value={amountInput}
									required
								/>
								<div class="mt-1.5 flex flex-wrap gap-1.5">
									{#each data.quickAmounts.filter((a) => a >= data.minimumWithdrawal) as quick (quick)}
										<button
											type="button"
											class="rounded-md border border-ink-200 px-2 py-1 font-mono text-[10px] text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
											onclick={() => (amountInput = String(quick))}
										>
											{formatIDR(quick)}
										</button>
									{/each}
									<button
										type="button"
										class="rounded-md border border-ink-200 px-2 py-1 font-mono text-[10px] text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
										onclick={() => (amountInput = String(Math.floor(data.wallet.availableNum)))}
									>
										Semua
									</button>
								</div>
							</div>

							<div class="grid gap-3 sm:grid-cols-3">
								<div>
									<label class="label" for="a-bank">Bank</label>
									<input id="a-bank" name="bankName" class="field mt-1 !py-1.5 !text-xs" placeholder="BCA" required />
								</div>
								<div>
									<label class="label" for="a-name">Atas Nama</label>
									<input
										id="a-name"
										name="bankAccountName"
										class="field mt-1 !py-1.5 !text-xs"
										placeholder="Nama sesuai rekening"
										required
									/>
								</div>
								<div>
									<label class="label" for="a-number">No. Rekening</label>
									<input
										id="a-number"
										name="bankAccountNumber"
										class="field mt-1 !py-1.5 !text-xs"
										inputmode="numeric"
										placeholder="1234567890"
										required
									/>
								</div>
							</div>

							<div class="flex items-center gap-2">
								<SubmitButton
									class="btn-primary !py-1.5 !text-xs"
									busy={forms.isBusy('withdraw')}
									busyLabel="Mengajukan…"
								>
									Kirim Pengajuan
									<ArrowRight class="size-3.5" />
								</SubmitButton>
								<button
									type="button"
									class="btn-secondary !py-1.5 !text-xs"
									disabled={forms.isBusy('withdraw')}
									onclick={() => (withdrawOpen = false)}
								>
									Batal
								</button>
							</div>
						</form>
					{/if}
				</div>
			</section>

			<section class="card">
				<div class="card-header">
					<h2 class="text-sm font-semibold">Riwayat Royalti</h2>
					<History class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				{#if data.ledger.length === 0}
					<p class="px-5 py-10 text-center text-xs text-ink-500 dark:text-ink-400">
						Belum ada royalti. Royalti masuk setelah buku tercatat terjual.
					</p>
				{:else}
					<ul class="divide-y divide-ink-100 dark:divide-ink-800">
						{#each data.ledger as l (l.id)}
							<li class="flex items-start justify-between gap-3 px-5 py-2.5">
								<div class="min-w-0">
									<p class="text-xs font-medium">
										{LEDGER_LABEL[l.entryType] ?? l.entryType}
										{#if l.description}
											<span class="font-normal text-ink-400">— {l.description}</span>
										{/if}
									</p>
									<p class="text-[10px] text-ink-400">{formatDate(l.createdAt)}</p>
								</div>
								<div class="shrink-0 text-right">
									<p class="font-mono text-xs tabular-nums {l.amountNum < 0 ? 'text-ink-500 dark:text-ink-400' : ''}">
										{l.amountNum < 0 ? '−' : '+'}{formatIDR(Math.abs(l.amountNum))}
									</p>
									<p class="mt-0.5">
										<span class="badge {TONE_CLASS[statusOf(ROYALTY_STATUS, l.status).tone]} !px-1.5 !py-0 !text-[9px]">
											{statusOf(ROYALTY_STATUS, l.status).label}
										</span>
									</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<section class="card h-fit min-w-0">
			<div class="card-header">
				<h2 class="text-sm font-semibold">Pengajuan Penarikan</h2>
				<CreditCard class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>
			{#if data.withdrawals.length === 0}
				<p class="px-5 py-10 text-center text-xs text-ink-500 dark:text-ink-400">
					Belum pernah mengajukan penarikan.
				</p>
			{:else}
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.withdrawals as w (w.id)}
						<li class="px-5 py-2.5">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="font-mono text-xs tabular-nums">{formatIDR(w.amountNum)}</p>
									<p class="truncate text-[10px] text-ink-400">
										{w.bankName ?? '—'}{w.bankAccountNumber ? ` · ${w.bankAccountNumber}` : ''}
									</p>
									<p class="text-[10px] text-ink-400">{formatDate(w.createdAt)}</p>
								</div>
								<StatusBadge {...statusOf(WITHDRAWAL_STATUS, w.status)} dot={false} />
							</div>
							{#if w.note}
								<p class="mt-1 text-[10px] text-ink-500 dark:text-ink-400">“{w.note}”</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
{/if}
