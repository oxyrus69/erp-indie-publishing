<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import TaskComments from '$lib/components/TaskComments.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import {
		TASK_STATUS,
		TRACK_LABEL,
		TONE_CLASS,
		formatDate,
		formatIDR,
		statusOf,
		type Tone
	} from '$lib/ui';
	import {
		AlertTriangle,
		ArrowRight,
		Banknote,
		CheckCircle2,
		Clock,
		FileText,
		History,
		Send,
		Wallet
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let tab = $state<'tasks' | 'wallet'>('tasks');
	let withdrawOpen = $state(false);
	let amountInput = $state('');

	const forms = createFormHandler();

	const submitTask = forms.make({
		key: 'submit-task',
		successTitle: 'Hasil terkirim',
		errorTitle: 'Gagal mengirim hasil',
		keepValues: true
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
			const raw = String(formData.get('amount') ?? '').replace(/[^\d]/g, '');
			const amount = Number.parseInt(raw, 10);
			const bank = String(formData.get('bankName') ?? '').trim();
			const holder = String(formData.get('bankAccountName') ?? '').trim();
			const account = String(formData.get('bankAccountNumber') ?? '').trim();
			if (!Number.isFinite(amount) || amount <= 0) return null;

			return {
				title: 'Kirim pengajuan penarikan?',
				confirmLabel: 'Ya, ajukan penarikan',
				facts: [
					{ label: 'Nominal', value: formatIDR(amount) },
					{ label: 'Bank', value: bank || '—' },
					{ label: 'Atas nama', value: holder || '—' },
					{ label: 'No. rekening', value: account || '—' },
					{ label: 'Saldo tersedia', value: formatIDR(data.wallet.availableNum) }
				],
				note: `Nominal langsung ditahan dari saldo tersedia dan menunggu persetujuan finance. Rekening tujuan tidak bisa diubah setelah pengajuan dikirim.`
			};
		}
	});

	const WITHDRAWAL_STATUS: Record<string, { label: string; tone: Tone }> = {
		REQUESTED: { label: 'Diajukan', tone: 'review' },
		APPROVED: { label: 'Disetujui', tone: 'progress' },
		PAID: { label: 'Dibayar', tone: 'done' },
		REJECTED: { label: 'Ditolak', tone: 'danger' }
	};

	const LEDGER_ENTRY: Record<string, string> = {
		TASK_COMMISSION: 'Komisi Task',
		BONUS: 'Bonus',
		WITHDRAWAL: 'Penarikan',
		ADJUSTMENT: 'Penyesuaian'
	};

	const LEDGER_STATUS: Record<string, { label: string; tone: Tone }> = {
		PENDING: { label: 'Tertahan', tone: 'review' },
		AVAILABLE: { label: 'Tersedia', tone: 'done' },
		WITHDRAWN: { label: 'Ditarik', tone: 'neutral' },
		CANCELLED: { label: 'Dibatalkan', tone: 'neutral' }
	};

	const groups = $derived([
		{
			key: 'IN_PROGRESS',
			label: 'Sedang Dikerjakan',
			hint: 'Kirim hasil begitu selesai agar penulis bisa review.',
			items: data.tasks.filter((t) => t.status === 'IN_PROGRESS')
		},
		{
			key: 'WAITING_AUTHOR_REVIEW',
			label: 'Menunggu Review Penulis',
			hint: 'Belum ada aksi — pantau bila ada revisi masuk.',
			items: data.tasks.filter((t) => t.status === 'WAITING_AUTHOR_REVIEW')
		},
		{
			key: 'PENDING',
			label: 'Belum Dimulai',
			hint: 'Task sudah ditugaskan tetapi belum berjalan.',
			items: data.tasks.filter((t) => t.status === 'PENDING')
		},
		{
			key: 'COMPLETED',
			label: 'Selesai',
			hint: 'Komisi sudah masuk ke saldo tersedia.',
			items: data.tasks.filter((t) => t.status === 'COMPLETED')
		}
	]);

	function deadlineMeta(days: number | null, status: string) {
		if (status === 'COMPLETED') return { text: 'Selesai', cls: 'text-ink-400' };
		if (days === null) return { text: 'Tanpa tenggat', cls: 'text-ink-400' };
		if (days < 0) return { text: `Lewat ${Math.abs(days)} hari`, cls: 'text-red-600 dark:text-red-400' };
		if (days === 0) return { text: 'Tenggat hari ini', cls: 'text-orange-600 dark:text-orange-400' };
		if (days <= 2) return { text: `${days} hari lagi`, cls: 'text-orange-600 dark:text-orange-400' };
		return { text: `${days} hari lagi`, cls: 'text-ink-500 dark:text-ink-400' };
	}

	function feeLabel(t: PageData['tasks'][number]) {
		if (t.feeStructure === 'PER_PAGE_RATE') {
			return `${formatIDR(t.perPageRate)} × ${t.pageCount} hlm`;
		}
		return 'Flat fee';
	}
</script>

<svelte:head><title>Tugas Saya · ERP Penerbitan</title></svelte:head>

<!-- ══════════════════════════ HEADER ══════════════════════════ -->
<header class="mb-7">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">Ruang Kerja Freelancer</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">
				Hai, {data.profile.fullName.split(' ')[0]}
			</h1>
			<p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
				{data.kpi.openTasks} task terbuka · {data.kpi.awaitingReview} menunggu review ·
				{data.kpi.completed} selesai
			</p>
		</div>
		{#if !data.profile.isActive}
			<span class="badge {TONE_CLASS.warn}">
				<AlertTriangle class="size-3" /> Akun tidak aktif
			</span>
		{/if}
	</div>

	{#if data.kpi.overdue > 0}
		<p class="mt-4">
			<span class="badge {TONE_CLASS.danger}">
				<AlertTriangle class="size-3" strokeWidth={2} />
				{data.kpi.overdue} task melewati tenggat
			</span>
		</p>
	{/if}
</header>

<!-- ══════════════════════════ KPI ══════════════════════════ -->
<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Saldo Tersedia</p>
			<Wallet class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.wallet.availableNum)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{#if data.wallet.pendingNum > 0}
				{formatIDR(data.wallet.pendingNum)} tertahan
			{:else}
				Siap ditarik ke rekening
			{/if}
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Nilai Task Terbuka</p>
			<Banknote class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.openValue)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Cair setelah penulis menyetujui</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Total Komisi</p>
			<CheckCircle2 class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(data.kpi.earned)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Dari {data.kpi.completed} task yang disetujui
		</p>
	</article>

	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<div class="flex items-center justify-between">
			<p class="label">Revisi Berjalan</p>
			<History class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<p class="mt-2 font-mono text-xl tabular-nums">{data.kpi.openRevisions}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			Diminta penulis, belum ditandai beres
		</p>
	</article>
</section>

<!-- ══════════════════════════ TAB ══════════════════════════ -->
<div class="mb-4 flex flex-wrap items-center gap-1.5">
	{#each [{ key: 'tasks' as const, label: 'Task', count: data.tasks.length }, { key: 'wallet' as const, label: 'Dompet & Riwayat', count: data.ledger.length }] as t (t.key)}
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

<!-- ══════════════════════════ TASK ══════════════════════════ -->
{#if tab === 'tasks'}
	{#if data.tasks.length === 0}
		<section class="card flex flex-col items-center gap-2 px-5 py-16 text-center">
			<FileText class="size-6 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			<p class="text-sm font-medium">Belum ada task</p>
			<p class="max-w-sm text-xs text-ink-500 dark:text-ink-400">
				Project Manager akan menugaskan task di sini. Pastikan spesialisasi profil Anda sudah
				sesuai.
			</p>
		</section>
	{:else}
		<div class="space-y-5">
			{#each groups as group (group.key)}
				{#if group.items.length > 0}
					<section class="card">
						<div class="card-header">
							<div>
								<h2 class="text-sm font-semibold">
									{group.label}
									<span class="ml-1 font-mono text-[11px] text-ink-400">{group.items.length}</span>
								</h2>
								<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{group.hint}</p>
							</div>
						</div>
						<ul class="divide-y divide-ink-100 dark:divide-ink-800">
							{#each group.items as t (t.id)}
								{@const meta = deadlineMeta(t.days, t.status)}
								{@const openRevisions = t.revisions.filter((r) => r.status === 'REQUESTED')}
								<li class="px-5 py-4">
									<div class="flex flex-wrap items-start justify-between gap-4">
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<span class="badge {TONE_CLASS.neutral}">
													{TRACK_LABEL[t.track] ?? t.track}
												</span>
												<StatusBadge {...statusOf(TASK_STATUS, t.status)} />
												{#if !t.isUnlocked}
													<span class="badge {TONE_CLASS.warn}">Terkunci</span>
												{/if}
											</div>
											<p class="mt-1.5 text-sm font-medium">{t.title}</p>
											<p class="text-[11px] text-ink-400">
												<a href="/portal" class="pointer-events-none">{t.projectTitle}</a>
												· {t.authorName}
											</p>
											{#if t.description}
												<p class="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
													{t.description}
												</p>
											{/if}

											<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
												<span class="flex items-center gap-1 {meta.cls}">
													<Clock class="size-3" />
													{meta.text}{#if t.deadline}· {formatDate(t.deadline)}{/if}
												</span>
												<span class="text-ink-500 dark:text-ink-400">
													Revisi {t.revisionCount}/{t.maxRevisions}
												</span>
												<span class="text-ink-500 dark:text-ink-400">{feeLabel(t)}</span>
											</div>

											{#if openRevisions.length > 0}
												<ul class="mt-2 space-y-1.5 border-l-2 border-amber-300 pl-2.5 dark:border-amber-800">
													{#each openRevisions as r (r.id)}
														<li>
															<p class="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
																Revisi #{r.revisionNo}
																{#if r.isChargeable}· berbayar{/if}
															</p>
															<p class="text-xs leading-relaxed text-ink-700 dark:text-ink-200">
																{r.notes}
															</p>
														</li>
													{/each}
												</ul>
											{/if}

											{#if t.revisions.length > openRevisions.length}
												<p class="mt-1.5 text-[10px] text-ink-400">
													{t.revisions.length - openRevisions.length} revisi lama sudah beres
												</p>
											{/if}

											<TaskComments
												taskId={t.id}
												comments={t.comments}
												canComment={true}
												canInternal={false}
												action="?/comment"
											/>
										</div>

										<div class="flex shrink-0 flex-col items-end gap-2">
											<div class="text-right">
												<p class="font-mono text-sm tabular-nums">
													{formatIDR(t.isCommissionCredited || t.status === 'COMPLETED' ? t.payoutNum : t.feeNum)}
												</p>
												<p class="text-[10px] text-ink-400">
													{#if t.isCommissionCredited}
														sudah dikreditkan
													{:else if t.status === 'COMPLETED'}
														menunggu kredit
													{:else}
														estimasi komisi
													{/if}
												</p>
											</div>
											{#if t.status === 'IN_PROGRESS'}
												<form
													method="POST"
													action="?/submit"
													use:enhance={submitTask}
													data-action="submit-{t.id}"
												>
													<input type="hidden" name="taskId" value={t.id} />
													<SubmitButton
														class="btn-primary !px-2.5 !py-1.5 !text-xs"
														busy={forms.isBusy(`submit-${t.id}`)}
														busyLabel="Mengirim…"
														disabled={!t.isUnlocked}
														title={t.isUnlocked ? 'Kirim hasil ke penulis' : 'Task terkunci'}
													>
														<Send class="size-3.5" />
														Kirim Hasil
													</SubmitButton>
												</form>
											{/if}
										</div>
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		</div>
	{/if}
{/if}

<!-- ══════════════════════════ DOMPET ══════════════════════════ -->
{#if tab === 'wallet'}
	<div class="grid gap-5 xl:grid-cols-3">
		<div class="min-w-0 space-y-5 xl:col-span-2">
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Saldo & Penarikan</h2>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							Komisi dirilis setelah penulis menyetujui hasil. Minimum penarikan
							{formatIDR(data.minimumWithdrawal)}.
						</p>
					</div>
					<Wallet class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>

				<dl class="grid gap-px border-y border-ink-100 bg-ink-100 sm:grid-cols-3 dark:border-ink-800 dark:bg-ink-800">
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
							<Banknote class="size-3.5" />
							{data.wallet.availableNum < data.minimumWithdrawal
								? `Saldo belum mencapai ${formatIDR(data.minimumWithdrawal)}`
								: 'Ajukan Penarikan'}
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
								<label class="label" for="amount">Nominal</label>
								<input
									id="amount"
									name="amount"
									class="field mt-1 font-mono"
									inputmode="numeric"
									placeholder="500000"
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
									<label class="label" for="bankName">Bank</label>
									<input id="bankName" name="bankName" class="field mt-1 !py-1.5 !text-xs" placeholder="BCA" required />
								</div>
								<div>
									<label class="label" for="bankAccountName">Atas Nama</label>
									<input
										id="bankAccountName"
										name="bankAccountName"
										class="field mt-1 !py-1.5 !text-xs"
										placeholder="Nama sesuai rekening"
										required
									/>
								</div>
								<div>
									<label class="label" for="bankAccountNumber">No. Rekening</label>
									<input
										id="bankAccountNumber"
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
					<h2 class="text-sm font-semibold">Riwayat Ledger</h2>
					<History class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>
				{#if data.ledger.length === 0}
					<p class="px-5 py-10 text-center text-xs text-ink-500 dark:text-ink-400">
						Belum ada entri komisi.
					</p>
				{:else}
					<ul class="divide-y divide-ink-100 dark:divide-ink-800">
						{#each data.ledger as l (l.id)}
							<li class="flex items-start justify-between gap-3 px-5 py-2.5">
								<div class="min-w-0">
									<p class="text-xs font-medium">
										{LEDGER_ENTRY[l.entryType] ?? l.entryType}
										{#if l.description}
											<span class="font-normal text-ink-400">— {l.description}</span>
										{/if}
									</p>
									<p class="text-[10px] text-ink-400">{formatDate(l.createdAt)}</p>
								</div>
								<div class="shrink-0 text-right">
									<p
										class="font-mono text-xs tabular-nums {l.amountNum < 0
											? 'text-ink-500 dark:text-ink-400'
											: ''}"
									>
										{l.amountNum < 0 ? '−' : '+'}{formatIDR(Math.abs(l.amountNum))}
									</p>
									<p class="mt-0.5">
										<span class="badge {TONE_CLASS[statusOf(LEDGER_STATUS, l.status).tone]} !px-1.5 !py-0 !text-[9px]">
											{statusOf(LEDGER_STATUS, l.status).label}
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
				<Banknote class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
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
