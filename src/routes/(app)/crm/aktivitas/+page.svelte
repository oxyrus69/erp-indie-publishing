<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { formatDate, formatDateTime } from '$lib/ui';
	import { AlertTriangle, ArrowLeft, CalendarClock, Clock3 } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const kindTone: Record<string, string> = {
		CALL: 'bg-yale-600',
		WHATSAPP: 'bg-emerald-600',
		EMAIL: 'bg-amber-600',
		MEETING: 'bg-violet-600',
		NOTE: 'bg-ink-400'
	};
</script>

<svelte:head><title>Aktivitas CRM · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/crm" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Prospek
	</a>
	<span aria-hidden="true">/</span>
	<span>Aktivitas</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="label">CRM</p>
			<h1 class="mt-1 font-serif text-3xl leading-tight tracking-tight">Aktivitas &amp; Follow-up</h1>
			<p class="mt-1 max-w-[62ch] text-sm text-ink-500 dark:text-ink-400">
				Percakapan terakhir dengan setiap prospek, dan tugas yang menunggu dikerjakan. Tugas
				lewat tenggat juga muncul di lonceng notifikasi.
			</p>
		</div>
		<a href="/crm/laporan" class="btn-secondary">Laporan CRM</a>
	</div>
</header>

{#if data.tasks.length > 0}
	<section class="card mb-6 overflow-hidden" aria-labelledby="judul-tugas">
		<div class="card-header">
			<div>
				<h2 id="judul-tugas" class="text-sm font-semibold">Perlu Dikerjakan</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					{data.tasks.length} tugas terbuka{data.overdueCount > 0
						? ` · ${data.overdueCount} lewat tenggat`
						: ''}{data.todayCount > 0 ? ` · ${data.todayCount} hari ini` : ''}
				</p>
			</div>
			<CalendarClock class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		<ul class="divide-y divide-ink-100 dark:divide-ink-800">
			{#each data.tasks as task (task.taskId)}
				<li class="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
					<div class="min-w-0">
						<a
							href={`/crm/${task.leadId}`}
							class="text-sm font-medium text-yale-700 hover:underline dark:text-yale-300"
						>
							{task.leadName}
						</a>
						<p class="text-sm text-ink-700 dark:text-ink-300">{task.title}</p>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							{data.stageLabel[task.leadStage] ?? task.leadStage}
						</p>
					</div>
					<span
						class="badge shrink-0 {task.overdue
							? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
							: task.today
								? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
								: 'border-ink-200 bg-ink-50 text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300'}"
					>
						{#if task.overdue}
							<AlertTriangle class="size-3" strokeWidth={2} /> lewat tenggat
						{:else if task.today}
							<Clock3 class="size-3" strokeWidth={2} /> hari ini
						{:else}
							{task.dueDate ? formatDate(task.dueDate) : 'tanpa tenggat'}
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<section class="card mb-6 px-5 py-8 text-center">
		<p class="text-sm font-medium">Tidak ada tugas follow-up terbuka</p>
		<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
			Buat tugas dari halaman detail prospek supaya janji tindak lanjut tidak bergantung ingatan.
		</p>
	</section>
{/if}

<section class="card overflow-hidden">
	<div class="card-header">
		<div>
			<h2 class="text-sm font-semibold">Riwayat Percakapan</h2>
			<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
				{data.activities.length} aktivitas terakhir dari seluruh pipeline.
			</p>
		</div>
	</div>
	<ol class="divide-y divide-ink-100 dark:divide-ink-800">
		{#each data.activities as activity (activity.activityId)}
			<li class="flex items-start gap-3 px-5 py-3">
				<span
					class="mt-1.5 size-2 shrink-0 rounded-full {kindTone[activity.kind] ?? 'bg-ink-400'}"
					aria-hidden="true"
				></span>
				<div class="min-w-0 flex-1">
					<p class="flex flex-wrap items-baseline gap-x-2">
						<a
							href={`/crm/${activity.leadId}`}
							class="text-sm font-medium text-yale-700 hover:underline dark:text-yale-300"
						>
							{activity.leadName}
						</a>
						<span class="text-xs text-ink-500 dark:text-ink-400">
							{data.kindLabel[activity.kind] ?? activity.kind}
							{#if activity.actorName}· {activity.actorName}{/if}
						</span>
					</p>
					{#if activity.bookTitle}
						<p class="text-[11px] text-ink-400">“{activity.bookTitle}”</p>
					{/if}
					{#if activity.note}
						<p class="mt-0.5 text-sm text-ink-700 dark:text-ink-300">{activity.note}</p>
					{/if}
					<p class="mt-0.5 font-mono text-[11px] tabular-nums text-ink-400">
						{formatDateTime(activity.createdAt)}
					</p>
				</div>
				<StatusBadge
					label={data.stageLabel[activity.leadStage] ?? activity.leadStage}
					tone={activity.leadStage === 'MENANG'
						? 'done'
						: activity.leadStage === 'KALAH'
							? 'danger'
							: 'progress'}
				/>
			</li>
		{:else}
			<li class="px-5 py-12 text-center">
				<p class="text-sm font-medium">Belum ada aktivitas</p>
				<p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
					Buka sebuah prospek, lalu catat kontak pertama. Semua tercatat di sini.
				</p>
			</li>
		{/each}
	</ol>
</section>
