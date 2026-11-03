<script lang="ts">
	import { enhance } from '$app/forms';
	import { MessageSquare, Send } from 'lucide-svelte';
	import SubmitButton from './SubmitButton.svelte';
	import { createFormHandler } from '$lib/client/forms.svelte';
	import { formatDateTime, ROLE_LABEL_ID } from '$lib/ui';

	/**
	 * Benang diskusi per task.
	 *
	 * Sebelumnya revisi penulis hanya catatan satu arah tanpa tempat membalas.
	 * Komentar menempel pada task — bukan project — karena diskusi nyata selalu
	 * tentang satu pekerjaan konkret.
	 *
	 * `canComment` memisahkan "boleh membaca" dari "boleh menulis": penulis
	 * hanya bisa menulis di portalnya, staf di halaman proyek.
	 */
	let {
		taskId,
		comments = [],
		canComment = false,
		canInternal = false,
		action = '?/comment'
	}: {
		taskId: string;
		comments?: {
			id: string;
			authorName: string;
			authorRole: string;
			body: string;
			isInternal: boolean;
			createdAt: Date | string;
		}[];
		canComment?: boolean;
		canInternal?: boolean;
		action?: string;
	} = $props();

	const forms = createFormHandler();

	let internal = $state(false);
	let open = $state(false);

	/**
	 * Handler dibuat sekali per task. Komponen ini selalu di-key per task
	 * (`{#each ... (task.id)}`), jadi `taskId` tidak berganti selama hidup.
	 */
	const submit = forms.make({
		key: 'comment',
		successTitle: 'Komentar terkirim',
		errorTitle: 'Komentar gagal dikirim',
		onSuccess: () => {
			internal = false;
		}
	});
</script>

<section class="border-t border-ink-100 pt-3 dark:border-ink-800">
	<button
		type="button"
		class="flex items-center gap-1.5 rounded-sm text-[11px] font-medium text-ink-500 transition hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<MessageSquare class="size-3.5" strokeWidth={1.75} />
		Diskusi
		{#if comments.length > 0}
			<span class="font-mono text-[10px] text-ink-400">({comments.length})</span>
		{/if}
	</button>

	{#if open}
		<div class="mt-2.5 space-y-2.5">
			{#if comments.length === 0}
				<p class="text-[11px] text-ink-500 dark:text-ink-400">
					Belum ada komentar. Tulis pertanyaan atau catatan revisi di sini agar tercatat pada
					task ini, bukan di percakapan lain.
				</p>
			{:else}
				<ul class="space-y-2.5">
					{#each comments as comment (comment.id)}
						<li
							class="rounded-lg px-3 py-2 {comment.isInternal
								? 'border border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20'
								: 'bg-ink-50 dark:bg-ink-800/60'}"
						>
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<p class="text-[11px] font-medium">{comment.authorName}</p>
								<p class="text-[10px] text-ink-400">
									{ROLE_LABEL_ID[comment.authorRole] ?? comment.authorRole} ·
									{formatDateTime(comment.createdAt)}
								</p>
								{#if comment.isInternal}
									<span class="badge border-amber-300 bg-amber-100 text-[9px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
										Internal
									</span>
								{/if}
							</div>
							<p class="mt-1 whitespace-pre-line text-xs leading-relaxed text-ink-700 dark:text-ink-200">
								{comment.body}
							</p>
						</li>
					{/each}
				</ul>
			{/if}

			{#if canComment}
				<form method="POST" {action} use:enhance={submit} class="space-y-1.5">
					<input type="hidden" name="taskId" value={taskId} />
					<label class="sr-only" for={`comment-${taskId}`}>Komentar untuk task ini</label>
					<textarea
						id={`comment-${taskId}`}
						name="body"
						rows="2"
						required
						maxlength="2000"
						placeholder="Tulis komentar…"
						aria-label="Komentar untuk task ini"
						class="field !py-1.5 !text-xs"
					></textarea>

					<div class="flex flex-wrap items-center justify-between gap-2">
						{#if canInternal}
							<label class="flex items-center gap-1.5 text-[10px] text-ink-500 dark:text-ink-400">
								<input
									type="checkbox"
									name="isInternal"
									bind:checked={internal}
									aria-label="Tandai sebagai catatan internal"
									class="size-3 rounded border-ink-300 dark:border-ink-600"
								/>
								Catatan internal (tidak terlihat penulis &amp; freelancer)
							</label>
						{:else}
							<span></span>
						{/if}

						<SubmitButton
							class="btn-secondary !px-2.5 !py-1 !text-[11px]"
							busy={forms.isBusy('comment')}
							busyLabel="Mengirim…"
						>
							<Send class="size-3" /> Kirim
						</SubmitButton>
					</div>
				</form>
			{/if}
		</div>
	{/if}
</section>
