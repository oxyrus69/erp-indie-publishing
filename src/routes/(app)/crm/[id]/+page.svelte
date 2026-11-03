<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import CurrencyInput from '$lib/components/CurrencyInput.svelte';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatDate, formatDateTime, formatIDR } from '$lib/ui';
	import {
		ArrowLeft,
		Check,
		CheckCircle2,
		Clock3,
		Plus,
		Tag,
		Trash2,
		Trophy,
		X
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const forms = createFormHandler();
	const lead = $derived(data.lead);

	let savingDetails = $state(false);
	let converting = $state(false);
	let losing = $state(false);

	const NEXT_STAGE: Record<string, { stage: string; label: string }> = {
		PROSPEK: { stage: 'KONTAK', label: 'Kontak' },
		KONTAK: { stage: 'PROPOSAL', label: 'Proposal' },
		PROPOSAL: { stage: 'NEGOSIASI', label: 'Negosiasi' }
	};
	const next = $derived(NEXT_STAGE[lead.stage] ?? null);

	const updateSubmit = forms.make({
		key: 'update-lead',
		successTitle: 'Prospek diperbarui',
		errorTitle: 'Perubahan gagal disimpan',
		keepValues: true,
		onSuccess: () => (savingDetails = false)
	});

	const stageSubmit = forms.make({
		key: 'stage-lead',
		successTitle: 'Tahap diperbarui',
		errorTitle: 'Tahap gagal diubah'
	});

	const activitySubmit = forms.make({
		key: 'log-activity',
		successTitle: 'Aktivitas tercatat',
		errorTitle: 'Aktivitas gagal dicatat'
	});

	const taskSubmit = forms.make({
		key: 'add-task',
		successTitle: 'Tugas dibuat',
		errorTitle: 'Tugas gagal dibuat'
	});

	const toggleTaskSubmit = forms.make({
		key: 'toggle-task',
		successTitle: 'Tugas diperbarui',
		errorTitle: 'Tugas gagal diperbarui'
	});

	const deleteTaskSubmit = forms.make({
		key: 'delete-task',
		successTitle: 'Tugas dihapus',
		errorTitle: 'Tugas gagal dihapus',
		confirm: () => ({
			title: 'Hapus tugas ini?',
			facts: [{ label: 'Akibat', value: 'Tugas hilang dari daftar follow-up' }],
			note: 'Bila tugas hanya tertunda, tandai selesai lalu buat yang baru agar jejaknya tetap ada.',
			confirmLabel: 'Ya, hapus',
			tone: 'danger'
		})
	});

	const tagSubmit = forms.make({
		key: 'add-tag',
		successTitle: 'Tag ditambahkan',
		errorTitle: 'Tag gagal ditambahkan'
	});

	const removeTagSubmit = forms.make({
		key: 'remove-tag',
		successTitle: 'Tag dihapus',
		errorTitle: 'Tag gagal dihapus'
	});

	const deleteActivitySubmit = forms.make({
		key: 'delete-activity',
		successTitle: 'Aktivitas dihapus',
		errorTitle: 'Aktivitas gagal dihapus',
		confirm: () => ({
			title: 'Hapus catatan aktivitas ini?',
			facts: [{ label: 'Akibat', value: 'Kontak terakhir dihitung ulang' }],
			note: 'Riwayat percakapan adalah alasan CRM ini ada. Hapus hanya bila salah catat.',
			confirmLabel: 'Ya, hapus',
			tone: 'danger'
		})
	});

	const convertSubmit = forms.make({
		key: 'convert-lead',
		successTitle: 'Prospek menang',
		errorTitle: 'Konversi gagal',
		confirm: () => ({
			title: 'Konversi prospek ini menjadi penulis?',
			facts: [
				{ label: 'Akibat', value: 'Akun penulis dibuat atau disambungkan' },
				{ label: 'Berikutnya', value: 'Order dibuat dari halaman Order' }
			],
			note: 'Tahap menjadi Menang dan tidak bisa dikembalikan. Riwayat percakapan tetap menempel di prospek ini.',
			confirmLabel: 'Ya, konversi'
		}),
		onSuccess: () => {
			converting = false;
		}
	});

	const loseSubmit = forms.make({
		key: 'lose-lead',
		successTitle: 'Prospek ditandai kalah',
		errorTitle: 'Gagal menandai kalah',
		confirm: () => ({
			title: 'Tandai prospek ini kalah?',
			facts: [{ label: 'Akibat', value: 'Keluar dari pipeline aktif' }],
			note: 'Alasan kalah dipakai untuk evaluasi sumber prospek. Tidak bisa diurungkan dari layar ini.',
			confirmLabel: 'Ya, tandai kalah',
			tone: 'danger'
		}),
		onSuccess: () => (losing = false)
	});
</script>

<svelte:head><title>{lead.fullName} · CRM · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/crm" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Prospek
	</a>
	<span aria-hidden="true">/</span>
	<span class="truncate">{lead.fullName}</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="font-serif text-3xl leading-tight tracking-tight">{lead.fullName}</h1>
				<StatusBadge
					label={data.stageLabel[lead.stage]}
					tone={lead.stage === 'MENANG'
						? 'done'
						: lead.stage === 'KALAH'
							? 'danger'
							: lead.stage === 'NEGOSIASI'
								? 'warn'
								: 'progress'}
				/>
				{#if lead.health !== 'SEHAT' && lead.stage !== 'MENANG' && lead.stage !== 'KALAH'}
					<span
						class="badge border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300"
					>
						{lead.health === 'PERLU_PERHATIAN' ? 'Perlu perhatian' : 'Berisiko dingin'}
					</span>
				{/if}
			</div>
			<p class="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
				{lead.bookTitle ? `“${lead.bookTitle}”` : 'Judul belum dicatat'}{lead.genre
					? ` · ${lead.genre}`
					: ''}
			</p>
			<dl class="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
				<div class="flex items-center gap-1.5">
					<dt class="text-ink-400">Estimasi</dt>
					<dd class="font-mono tabular-nums text-ink-700 dark:text-ink-300">
						{lead.estimatedValue > 0 ? formatIDR(lead.estimatedValue) : '—'}
					</dd>
				</div>
				<div class="flex items-center gap-1.5">
					<dt class="text-ink-400">Kontak terakhir</dt>
					<dd class="text-ink-700 dark:text-ink-300">
						{lead.daysSince === null ? 'belum pernah' : `${lead.daysSince} hari lalu`}
					</dd>
				</div>
				<div class="flex items-center gap-1.5">
					<dt class="text-ink-400">Pemilik</dt>
					<dd class="text-ink-700 dark:text-ink-300">{lead.ownerName ?? 'tanpa pemilik'}</dd>
				</div>
				<div class="flex items-center gap-1.5">
					<dt class="text-ink-400">Sumber</dt>
					<dd class="text-ink-700 dark:text-ink-300">{data.sourceLabel[lead.source]}</dd>
				</div>
			</dl>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			{#if next && !lead.authorId && lead.stage !== 'KALAH'}
				<form method="POST" action="?/stage" use:enhance={stageSubmit} data-action="stage-lead">
					<input type="hidden" name="leadId" value={lead.id} />
					<input type="hidden" name="stage" value={next.stage} />
					<SubmitButton class="btn-secondary" busy={forms.isBusy('stage-lead')} busyLabel="Memindahkan…">
						Ke {next.label}
					</SubmitButton>
				</form>
			{/if}
			<button type="button" class="btn-secondary" onclick={() => (savingDetails = !savingDetails)}>
				{#if savingDetails}<X class="size-4" /> Tutup{:else}Ubah data{/if}
			</button>
		</div>
	</div>
</header>

{#if savingDetails}
	<section class="card mb-6">
		<div class="card-header">
			<div>
				<h2 class="text-sm font-semibold">Ubah Data Prospek</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					Tahap tidak diubah di sini; gunakan tombol tahap agar jejaknya tercatat.
				</p>
			</div>
		</div>
		<form method="POST" action="?/update" use:enhance={updateSubmit} data-action="update-lead" class="space-y-4 px-5 py-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="label">Nama Prospek</span>
					<input type="text" name="fullName" class="field mt-1" value={lead.fullName} required minlength="3" />
				</label>
				<label class="block">
					<span class="label">Email</span>
					<input type="email" name="email" class="field mt-1" value={lead.email ?? ''} />
				</label>
				<label class="block">
					<span class="label">Telepon</span>
					<input type="tel" name="phone" class="field mt-1" value={lead.phone ?? ''} />
				</label>
				<label class="block">
					<span class="label">Sumber</span>
					<select name="source" class="field mt-1">
						{#each data.sources as source (source)}
							<option value={source} selected={lead.source === source}>
								{data.sourceLabel[source]}
							</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="label">Judul Buku</span>
					<input type="text" name="bookTitle" class="field mt-1" value={lead.bookTitle ?? ''} />
				</label>
				<label class="block">
					<span class="label">Genre</span>
					<input type="text" name="genre" class="field mt-1" value={lead.genre ?? ''} />
				</label>
				<CurrencyInput
					name="estimatedValue"
					label="Estimasi Nilai Kontrak"
					value={lead.estimatedValue}
					hint="Wajib terisi sebelum masuk Negosiasi."
					class="block"
				/>
				<label class="block">
					<span class="label">Pemilik</span>
					<select name="ownerId" class="field mt-1">
						<option value="">Tanpa pemilik</option>
						{#each data.owners as owner (owner.id)}
							<option value={owner.id} selected={lead.ownerId === owner.id}>{owner.fullName}</option>
						{/each}
					</select>
				</label>
				<label class="block sm:col-span-2">
					<span class="label">Catatan</span>
					<textarea name="notes" rows="3" class="field mt-1">{lead.notes ?? ''}</textarea>
				</label>
			</div>
			<div class="flex items-center justify-end gap-3 border-t border-ink-100 pt-4 dark:border-ink-800">
				<button type="button" class="btn-secondary" onclick={() => (savingDetails = false)}>Batal</button>
				<SubmitButton busy={forms.isBusy('update-lead')}>Simpan perubahan</SubmitButton>
			</div>
		</form>
	</section>
{/if}

<div class="grid gap-6 lg:grid-cols-3">
	<!-- ═════════════════ KIRI: aktivitas + tugas ═════════════════ -->
	<div class="space-y-6 lg:col-span-2">
		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Catat Aktivitas</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Mencatat telepon, WhatsApp, atau pertemuan memperbarui kontak terakhir secara
						otomatis.
					</p>
				</div>
				<Clock3 class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>
			<form method="POST" action="?/activity" use:enhance={activitySubmit} data-action="log-activity" class="space-y-3 px-5 py-4">
				<div class="grid gap-3 sm:grid-cols-[minmax(0,10rem)_1fr]">
					<label class="block">
						<span class="label">Jenis</span>
						<select name="kind" class="field mt-1">
							{#each data.activityKinds as kind (kind)}
								<option value={kind}>{data.activityKindLabel[kind]}</option>
							{/each}
						</select>
					</label>
					<label class="block">
						<span class="label">Ringkasan</span>
						<input
							type="text"
							name="note"
							class="field mt-1"
							placeholder="Apa yang dibicarakan, apa langkah berikutnya"
						/>
					</label>
				</div>
				<div class="flex justify-end">
					<SubmitButton class="btn-secondary" busy={forms.isBusy('log-activity')}>
						<Plus class="size-4" /> Catat
					</SubmitButton>
				</div>
			</form>
		</section>

		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Riwayat Percakapan</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						{data.activities.length} aktivitas tercatat, terbaru di atas.
					</p>
				</div>
			</div>
			<ol class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.activities as activity (activity.id)}
					<li class="group flex items-start gap-3 px-5 py-3">
						<span
							class="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-100 font-mono text-[10px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
							aria-hidden="true"
						>
							{data.activityKindLabel[activity.kind].slice(0, 2).toUpperCase()}
						</span>
						<div class="min-w-0 flex-1">
							<p class="flex flex-wrap items-baseline gap-x-2 text-sm">
								<span class="font-medium">{data.activityKindLabel[activity.kind]}</span>
								<span class="text-xs text-ink-500 dark:text-ink-400">
									{activity.actorName ?? 'Tanpa staf'}
								</span>
							</p>
							{#if activity.note}
								<p class="mt-0.5 text-sm text-ink-700 dark:text-ink-300">{activity.note}</p>
							{/if}
							<p class="mt-0.5 font-mono text-[11px] tabular-nums text-ink-400">
								{formatDateTime(activity.createdAt)}
							</p>
						</div>
						<form method="POST" action="?/deleteActivity" use:enhance={deleteActivitySubmit} data-action="delete-activity">
							<input type="hidden" name="activityId" value={activity.id} />
							<button
								type="submit"
								class="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-red-700 focus-visible:outline focus-visible:outline-2 dark:hover:bg-ink-800 dark:hover:text-red-400"
								aria-label="Hapus aktivitas {formatDateTime(activity.createdAt)}"
								disabled={forms.isBusy('delete-activity')}
							>
								<Trash2 class="size-3.5" />
							</button>
						</form>
					</li>
				{:else}
					<li class="px-5 py-10 text-center">
						<p class="text-sm font-medium">Belum ada percakapan tercatat</p>
						<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
							Catat kontak pertama di atas supaya prospek ini tidak masuk daftar dingin.
						</p>
					</li>
				{/each}
			</ol>
		</section>

		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Tugas Follow-up</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Tugas yang lewat tenggat muncul di lonceng notifikasi.
					</p>
				</div>
			</div>
			<form method="POST" action="?/addTask" use:enhance={taskSubmit} data-action="add-task" class="flex flex-wrap items-end gap-2 px-5 py-3">
				<label class="block min-w-40 flex-1">
					<span class="label">Tugas</span>
					<input
						type="text"
						name="title"
						class="field mt-1"
						placeholder="Kirim proposal revisi"
						required
						minlength="3"
					/>
				</label>
				<label class="block">
					<span class="label">Tenggat</span>
					<input type="date" name="dueDate" class="field mt-1" />
				</label>
				<SubmitButton class="btn-secondary" busy={forms.isBusy('add-task')}>
					<Plus class="size-4" /> Tambah
				</SubmitButton>
			</form>
			<ul class="divide-y divide-ink-100 border-t border-ink-100 dark:divide-ink-800 dark:border-ink-800">
				{#each data.tasks as task (task.id)}
					{@const overdue =
						!task.done &&
						task.dueDate !== null &&
						new Date(`${task.dueDate}T23:59:59`).getTime() < Date.now()}
					<li class="flex items-center gap-3 px-5 py-2.5">
						<form method="POST" action="?/toggleTask" use:enhance={toggleTaskSubmit} data-action="toggle-task">
							<input type="hidden" name="taskId" value={task.id} />
							<button
								type="submit"
								class="inline-flex size-5 items-center justify-center rounded border {task.done
									? 'border-emerald-600 bg-emerald-600 text-white'
									: 'border-ink-300 hover:border-yale-600 dark:border-ink-600'}"
								aria-pressed={task.done}
								aria-label={task.done ? `Buka kembali ${task.title}` : `Tandai selesai ${task.title}`}
								disabled={forms.isBusy('toggle-task')}
							>
								{#if task.done}<Check class="size-3.5" />{/if}
							</button>
						</form>
						<div class="min-w-0 flex-1">
							<p class="text-sm {task.done ? 'text-ink-400 line-through dark:text-ink-500' : 'text-ink-800 dark:text-ink-200'}">
								{task.title}
							</p>
							{#if task.dueDate}
								<p class="font-mono text-[11px] tabular-nums {overdue ? 'text-red-700 dark:text-red-400' : 'text-ink-400'}">
									{task.done ? 'selesai' : overdue ? 'lewat tenggat' : 'tenggat'}
									· {formatDate(task.dueDate)}
								</p>
							{/if}
						</div>
						<form method="POST" action="?/deleteTask" use:enhance={deleteTaskSubmit} data-action="delete-task">
							<input type="hidden" name="taskId" value={task.id} />
							<button
								type="submit"
								class="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-red-700 dark:hover:bg-ink-800 dark:hover:text-red-400"
								aria-label="Hapus tugas {task.title}"
								disabled={forms.isBusy('delete-task')}
							>
								<Trash2 class="size-3.5" />
							</button>
						</form>
					</li>
				{:else}
					<li class="px-5 py-8 text-center text-xs text-ink-500 dark:text-ink-400">
						Tidak ada tugas terbuka. Buat satu agar follow-up tidak bergantung ingatan.
					</li>
				{/each}
			</ul>
		</section>
	</div>

	<!-- ═════════════════ KANAN: konversi, tag, bahaya ═════════════════ -->
	<div class="space-y-6">
		{#if lead.stage === 'MENANG' && lead.authorId}
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Sudah Menang</h2>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							{data.authorName ?? 'Akun penulis'} terhubung sejak
							{formatDate(lead.convertedAt)}
						</p>
					</div>
					<Trophy class="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
				</div>
				<div class="space-y-3 px-5 py-4">
					<p class="text-sm text-ink-600 dark:text-ink-300">
						Langkah berikutnya membuat order atas nama penulis ini. Judul dan paket dipilih di
						halaman Order.
					</p>
					<a
						href={`/orders?authorId=${lead.authorId}${lead.bookTitle ? `&bookTitle=${encodeURIComponent(lead.bookTitle)}` : ''}`}
						class="btn-primary w-full justify-center"
					>
						Buat order untuk {data.authorName ?? 'penulis'}
					</a>
					<a href="/admin/penulis" class="link block text-center text-xs">
						Buka direktori penulis
					</a>
				</div>
			</section>
		{:else if lead.stage === 'KALAH'}
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Prospek Kalah</h2>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Alasan yang tercatat</p>
					</div>
					<X class="size-4 text-red-600 dark:text-red-400" strokeWidth={1.5} />
				</div>
				<div class="space-y-3 px-5 py-4">
					<p class="text-sm text-ink-700 dark:text-ink-300">{lead.lostReason ?? 'Tidak dicatat.'}</p>
					<form method="POST" action="?/stage" use:enhance={stageSubmit} data-action="stage-lead">
						<input type="hidden" name="leadId" value={lead.id} />
						<input type="hidden" name="stage" value="PROSPEK" />
						<SubmitButton class="btn-secondary w-full justify-center" busy={forms.isBusy('stage-lead')}>
							Kembalikan ke prospek
						</SubmitButton>
					</form>
				</div>
			</section>
		{:else}
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Konversi Menang</h2>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							Prospek menjadi akun penulis, riwayatnya tetap menempel.
						</p>
					</div>
					<Trophy class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
				</div>

				{#if converting}
					<form method="POST" action="?/convert" use:enhance={convertSubmit} data-action="convert-lead" class="space-y-3 px-5 py-4">
						{#if !lead.email}
							<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
								Email prospek belum diisi. Tambahkan lewat “Ubah data” sebelum konversi.
							</p>
						{/if}
						<label class="block">
							<span class="label">Judul Buku</span>
							<input type="text" name="bookTitle" class="field mt-1" value={lead.bookTitle ?? ''} />
						</label>
						<label class="block">
							<span class="label">Paket (opsional)</span>
							<select name="packageId" class="field mt-1">
								<option value="">Pilih saat membuat order</option>
								{#each data.packages as pkg (pkg.id)}
									<option value={pkg.id}>{pkg.name} · {formatIDR(pkg.basePriceNum)}</option>
								{/each}
							</select>
						</label>
						<div class="flex items-center justify-end gap-2 pt-1">
							<button type="button" class="btn-secondary" onclick={() => (converting = false)}>
								Batal
							</button>
							<SubmitButton busy={forms.isBusy('convert-lead')} busyLabel="Mengonversi…" disabled={!lead.email}>
								<CheckCircle2 class="size-4" /> Konversi
							</SubmitButton>
						</div>
					</form>
				{:else}
					<div class="space-y-3 px-5 py-4">
						<p class="text-sm text-ink-600 dark:text-ink-300">
							Konversi membuat akun penulis dari email prospek (atau menyambung ke akun yang
							sudah ada), lalu tahap menjadi Menang.
						</p>
						<button
							type="button"
							class="btn-primary w-full justify-center"
							onclick={() => (converting = true)}
							disabled={lead.stage === 'NEGOSIASI' ? false : lead.estimatedValue <= 0}
						>
							<Trophy class="size-4" /> Tandai menang &amp; konversi
						</button>
						{#if lead.estimatedValue <= 0}
							<p class="text-[11px] text-ink-500 dark:text-ink-400">
								Isi estimasi nilai kontrak dulu supaya laporan menang tidak nol.
							</p>
						{/if}
					</div>
				{/if}
			</section>

			{#if losing}
				<section class="card">
					<div class="card-header">
						<div>
							<h2 class="text-sm font-semibold">Tandai Kalah</h2>
							<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Alasan dipakai untuk evaluasi</p>
						</div>
					</div>
					<form method="POST" action="?/stage" use:enhance={loseSubmit} data-action="lose-lead" class="space-y-3 px-5 py-4">
						<input type="hidden" name="stage" value="KALAH" />
						<label class="block">
							<span class="label">Alasan</span>
							<textarea
								name="reason"
								rows="3"
								class="field mt-1"
								required
								minlength="5"
								placeholder="Mis. memilih penerbit lain karena biaya cetak."
							></textarea>
						</label>
						<div class="flex items-center justify-end gap-2">
							<button type="button" class="btn-secondary" onclick={() => (losing = false)}>Batal</button>
							<SubmitButton class="btn-danger" busy={forms.isBusy('lose-lead')} busyLabel="Menyimpan…">
								Tandai kalah
							</SubmitButton>
						</div>
					</form>
				</section>
			{:else}
				<button type="button" class="btn-secondary w-full justify-center" onclick={() => (losing = true)}>
					<X class="size-4" /> Tandai kalah
				</button>
			{/if}
		{/if}

		<section class="card">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Tag</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Segmentasi ringan</p>
				</div>
				<Tag class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
			</div>
			<div class="px-5 py-4">
				{#if lead.tags.length > 0}
					<ul class="mb-3 flex flex-wrap gap-1.5">
						{#each lead.tags as tag (tag)}
							<li>
								<form method="POST" action="?/removeTag" use:enhance={removeTagSubmit} data-action="remove-tag">
									<input type="hidden" name="name" value={tag} />
									<button
										type="submit"
										class="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600 hover:border-red-300 hover:text-red-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300 dark:hover:text-red-400"
										aria-label="Hapus tag {tag}"
										disabled={forms.isBusy('remove-tag')}
									>
										{tag} <X class="size-3" />
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mb-3 text-xs text-ink-500 dark:text-ink-400">Belum ada tag.</p>
				{/if}
				<form method="POST" action="?/addTag" use:enhance={tagSubmit} data-action="add-tag" class="flex gap-2">
					<label class="sr-only" for="new-tag">Tag baru</label>
					<input
						id="new-tag"
						type="text"
						name="name"
						class="field"
						placeholder="mis. potensi-lanjut"
						maxlength="40"
					/>
					<SubmitButton class="btn-secondary" busy={forms.isBusy('add-tag')}>Tambah</SubmitButton>
				</form>
			</div>
		</section>

		{#if data.outreach.length > 0}
			<section class="card">
				<div class="card-header">
					<div>
						<h2 class="text-sm font-semibold">Pesan Terkirim</h2>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							{data.outreach.length} pesan dari template atau ketikan
						</p>
					</div>
				</div>
				<ul class="divide-y divide-ink-100 dark:divide-ink-800">
					{#each data.outreach.slice(0, 5) as log (log.id)}
						<li class="px-5 py-3">
							<p class="flex items-center justify-between gap-2 text-[11px] text-ink-400">
								<span class="font-mono uppercase tracking-wide">{log.channel}</span>
								<span>{formatDateTime(log.createdAt)}</span>
							</p>
							<p class="mt-1 line-clamp-3 whitespace-pre-line text-xs text-ink-700 dark:text-ink-300">
								{log.message}
							</p>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="card border-red-200/70 dark:border-red-900/40">
			<div class="card-header">
				<div>
					<h2 class="text-sm font-semibold">Hapus Prospek</h2>
					<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
						Hanya untuk baris yang salah catat.
					</p>
				</div>
			</div>
			<form method="POST" action="?/delete" use:enhance={forms.make({
				key: 'delete-lead',
				successTitle: 'Prospek dihapus',
				errorTitle: 'Gagal menghapus',
				confirm: () => ({
					title: `Hapus ${lead.fullName} dari pipeline?`,
					facts: [{ label: 'Akibat', value: 'Aktivitas dan tugas ikut terhapus' }],
					note: 'Bila prospek hanya batal, tandai kalah agar alasannya tetap tercatat.',
					confirmLabel: 'Ya, hapus',
					tone: 'danger'
				})
			})} data-action="delete-lead" class="space-y-3 px-5 py-4">
				<label class="block">
					<span class="label">Alasan</span>
					<input
						type="text"
						name="reason"
						class="field mt-1"
						required
						minlength="5"
						placeholder="Mis. duplikat entri"
					/>
				</label>
				<SubmitButton class="btn-danger w-full justify-center" busy={forms.isBusy('delete-lead')}>
					<Trash2 class="size-4" /> Hapus
				</SubmitButton>
			</form>
		</section>
	</div>
</div>
