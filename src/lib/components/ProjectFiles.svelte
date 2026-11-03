<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitButton from '$lib/components/SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatDateTime } from '$lib/ui';
	import { Download, FileText, Lock, Upload } from 'lucide-svelte';

	/** Label jenis berkas (enum `file_kind`). */
	const FILE_LABEL: Record<string, string> = {
		MANUSCRIPT: 'Naskah',
		COVER_DRAFT: 'Draft Cover',
		COVER_FINAL: 'Cover Final',
		COVER_PREVIEW: 'Preview Cover',
		LAYOUT_PDF: 'PDF Layout',
		LAYOUT_PREVIEW: 'Preview Layout',
		ISBN_BARCODE: 'Barcode ISBN',
		LEGAL_DOC: 'Dokumen Legal',
		CATALOG_THUMB: 'Thumbnail Katalog'
	};

	/**
	 * Daftar berkas + form unggah.
	 *
	 * Dua pihak memakai komponen ini dengan hak berbeda:
	 *  - staf internal mengunggah naskah, PDF layout, cover, dan dokumen legal;
	 *  - penulis hanya melihat berkas proyeknya dan mengunduh yang sudah terbuka.
	 *
	 * `canUpload` memisahkan hak menulis dari hak membaca, sehingga komponen
	 * yang sama tidak perlu diduplikasi menjadi dua tampilan.
	 */
	let {
		projectId,
		files = [],
		canUpload = false,
		kinds = [],
		action = '?/upload',
		highResUnlocked = false
	}: {
		projectId: string;
		files: {
			id: string;
			kind: string;
			fileName: string;
			sizeBytes: number;
			version: number;
			isPreview: boolean;
			requiresFullPayment: boolean;
			createdAt: Date | string;
			url?: string | null;
		}[];
		canUpload?: boolean;
		/** Jenis yang boleh diunggah pihak ini. */
		kinds?: { value: string; label: string }[];
		action?: string;
		highResUnlocked?: boolean | null;
	} = $props();

	/** Gerbang pelunasan dinormalkan ke boolean: null dari DB berarti terkunci. */
	const unlocked = $derived(Boolean(highResUnlocked));

	const forms = createFormHandler();

	let uploading = $state(false);
	/** Jenis pertama dipakai sebagai pilihan awal saat form dibuka. */
	function initialKind(): string {
		return kinds[0]?.value ?? 'MANUSCRIPT';
	}
	let chosenKind = $state(initialKind());

	const uploadSubmit = forms.make({
		key: 'upload-file',
		successTitle: 'Berkas terunggah',
		errorTitle: 'Unggah gagal',
		onSuccess: () => (uploading = false)
	});

	function sizeLabel(bytes: number): string {
		if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	/** Berkas master terkunci sampai pelunasan — jelaskan, jangan sembunyikan. */
	function locked(file: { requiresFullPayment: boolean; isPreview: boolean }): boolean {
		return file.requiresFullPayment && !file.isPreview && !unlocked;
	}
</script>

<section class="card overflow-hidden">
	<div class="card-header">
		<div>
			<h2 class="text-sm font-semibold">Berkas Proyek</h2>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
				{#if canUpload}
					Naskah, PDF layout, cover, dan dokumen legal. Versi baru menimpa tampilan tanpa
					menghapus riwayat.
				{:else if unlocked}
					File master terbuka karena order sudah lunas dan hasil disetujui.
				{:else}
					Preview tersedia; file master terbuka setelah pelunasan.
				{/if}
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if canUpload}
				<button
					type="button"
					class="btn-secondary !px-2 !py-1 !text-[11px]"
					onclick={() => (uploading = !uploading)}
				>
					<Upload class="size-3" /> Unggah
				</button>
			{/if}
			<FileText class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
	</div>

	{#if uploading && canUpload}
		<form
			method="POST"
			{action}
			enctype="multipart/form-data"
			use:enhance={uploadSubmit}
			data-action="upload-file"
			class="space-y-3 border-b border-ink-100 bg-ink-50/60 px-5 py-4 dark:border-ink-800 dark:bg-ink-800/30"
		>
			<input type="hidden" name="projectId" value={projectId} />

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block">
					<span class="label">Jenis Berkas</span>
					<select
						name="kind"
						class="field mt-1"
						aria-label="Jenis berkas"
						bind:value={chosenKind}
					>
						{#each kinds as kind (kind.value)}
							<option value={kind.value}>{kind.label}</option>
						{/each}
					</select>
				</label>

				<label class="block">
					<span class="label">Pilih Berkas</span>
					<input
						type="file"
						name="file"
						required
						class="field mt-1 !py-1.5 !text-xs file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-2 file:py-1 file:text-[11px] file:font-medium dark:file:bg-ink-800"
						aria-label="Pilih berkas untuk diunggah"
					/>
				</label>
			</div>

			<p class="text-[11px] text-ink-500 dark:text-ink-400">
				{#if chosenKind === 'MANUSCRIPT'}
					Naskah: PDF, DOC/DOCX, RTF, atau TXT maksimal 50MB. Ditandai sebagai berkas master
					(terbuka setelah pelunasan).
				{:else if chosenKind === 'LAYOUT_PDF'}
					PDF layout maksimal 50MB. Ditandai sebagai berkas master.
				{:else if chosenKind.startsWith('COVER')}
					Cover: PNG, JPEG, atau WebP maksimal 10MB.
				{:else}
					Maksimal 10MB, sesuai jenis dokumen.
				{/if}
			</p>

			<div class="flex flex-wrap items-center gap-2">
				<SubmitButton class="btn-primary !py-1.5 !text-xs" busy={forms.isBusy('upload-file')} busyLabel="Mengunggah…">
					<Upload class="size-3.5" /> Unggah berkas
				</SubmitButton>
				<button type="button" class="btn-secondary !py-1.5 !text-xs" onclick={() => (uploading = false)}>
					Batal
				</button>
			</div>
		</form>
	{/if}

	{#if files.length === 0}
		<p class="px-5 py-8 text-center text-xs text-ink-500 dark:text-ink-400">
			{#if canUpload}
				Belum ada berkas. Unggah naskah agar produksi bisa dimulai.
			{:else}
				Belum ada berkas yang diunggah.
			{/if}
		</p>
	{:else}
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each files as file (file.id)}
				<li class="flex items-center justify-between gap-3 px-5 py-2.5">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium">
							{FILE_LABEL[file.kind] ?? file.kind}
							<span class="font-normal text-ink-400">· v{file.version}</span>
						</p>
						<p class="truncate text-[10px] text-ink-400">
							{file.fileName} · {sizeLabel(file.sizeBytes)} · {formatDateTime(file.createdAt)}
						</p>
					</div>

					{#if locked(file)}
						<span
							class="flex shrink-0 items-center gap-1 text-[10px] text-ink-400"
							title="Terbuka setelah pelunasan"
						>
							<Lock class="size-3" /> Terkunci
						</span>
					{:else if file.url}
						<a
							href={file.url}
							class="flex shrink-0 items-center gap-1 text-[11px] font-medium text-yale-700 underline-offset-4 hover:underline dark:text-yale-300"
							target="_blank"
							rel="noopener"
						>
							<Download class="size-3" /> Unduh
						</a>
					{:else}
						<span class="shrink-0 text-[10px] text-ink-400">Tak tersedia</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
