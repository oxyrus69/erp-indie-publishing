<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { ORDER_STATUS, PRINT_STAGE, PROJECT_STATUS, formatDate, formatIDR, statusOf } from '$lib/ui';
	import { ArrowLeft, ArrowRight, BookOpen, Mail, Phone, Receipt } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const author = $derived(data.author);
	const paidPct = $derived(
		author.contractValue > 0
			? Math.round(
					(data.orders.reduce(
						(sum: number, order: (typeof data.orders)[number]) => sum + order.paidAmount,
						0
					) /
						author.contractValue) *
						100
				)
			: 0
	);
</script>

<svelte:head><title>{author.fullName} · Penulis · ERP Penerbitan</title></svelte:head>

<nav class="mb-4 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400" aria-label="Remah roti">
	<a href="/admin/penulis" class="link inline-flex items-center gap-1">
		<ArrowLeft class="size-3.5" /> Penulis
	</a>
	<span aria-hidden="true">/</span>
	<span class="truncate">{author.fullName}</span>
</nav>

<header class="mb-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="font-serif text-3xl leading-tight tracking-tight">{author.fullName}</h1>
				{#if !author.isActive}
					<StatusBadge label="Nonaktif" tone="neutral" />
				{/if}
				{#if author.leadStage}
					<StatusBadge
						label={author.leadStage === 'MENANG' ? 'Dari CRM' : author.leadStage}
						tone="done"
					/>
				{/if}
			</div>
			<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
				{#if author.email}
					<a href={`mailto:${author.email}`} class="inline-flex items-center gap-1.5 hover:underline">
						<Mail class="size-3.5" /> {author.email}
					</a>
				{/if}
				{#if author.phone}
					<span class="inline-flex items-center gap-1.5">
						<Phone class="size-3.5" /> {author.phone}
					</span>
				{/if}
				<span>Terdaftar {formatDate(author.createdAt)}</span>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if author.leadId}
				<a href={`/crm/${author.leadId}`} class="btn-secondary">Buka di CRM</a>
			{/if}
			<a href={`/orders?authorId=${author.id}`} class="btn-primary">
				<Receipt class="size-4" /> Buat order
			</a>
		</div>
	</div>
</header>

{#if author.daysSinceContact !== null && author.daysSinceContact > 30 && author.activeOrderCount === 0}
	<p
		class="mb-6 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300"
	>
		Terakhir dihubungi {author.daysSinceContact} hari lalu dan tidak ada order berjalan. Ini momen
		yang tepat untuk menyapa ulang.
	</p>
{/if}

<section
	class="mb-6 grid gap-px overflow-hidden rounded-xl border border-ink-200/80 bg-ink-100 sm:grid-cols-2 xl:grid-cols-4 dark:border-ink-800 dark:bg-ink-800"
	aria-label="Ringkasan penulis"
>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Nilai Kontrak</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(author.contractValue)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{author.orderCount} order · {paidPct}% terbayar
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Royalti Tersedia</p>
		<p class="mt-2 font-mono text-xl tabular-nums">{formatIDR(author.royaltyAvailable)}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{formatIDR(author.royaltyWithdrawn)} sudah ditarik
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Buku</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">{author.bookCount}</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{author.publishedCount} sudah terbit
		</p>
	</article>
	<article class="bg-white px-5 py-4 dark:bg-ink-900">
		<p class="label">Sentuhan CRM</p>
		<p class="mt-2 font-mono text-2xl tabular-nums">
			{author.daysSinceContact === null ? '—' : `${author.daysSinceContact} h`}
		</p>
		<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
			{author.activityCount > 0 ? `${author.activityCount} aktivitas tercatat` : 'belum ada aktivitas'}
		</p>
	</article>
</section>

{#if author.leadTags.length > 0}
	<ul class="mb-6 flex flex-wrap items-center gap-1.5" aria-label="Tag CRM">
		{#each author.leadTags as tag (tag)}
			<li
				class="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-0.5 text-[11px] text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
			>
				{tag}
			</li>
		{/each}
	</ul>
{/if}

<div class="grid gap-6 lg:grid-cols-2">
	<section class="card overflow-hidden" aria-labelledby="judul-order">
		<div class="card-header">
			<div>
				<h2 id="judul-order" class="text-sm font-semibold">Order</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					{author.orderCount} kontrak, {author.activeOrderCount} masih berjalan.
				</p>
			</div>
			<Receipt class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		{#if data.orders.length > 0}
			<ul class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.orders as order (order.id)}
					<li class="px-5 py-3">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<p class="text-sm font-medium">{order.bookTitle ?? 'Tanpa judul'}</p>
							<StatusBadge
								label={statusOf(ORDER_STATUS, order.status).label}
								tone={statusOf(ORDER_STATUS, order.status).tone}
							/>
						</div>
						<p class="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-xs text-ink-500 dark:text-ink-400">
							<span class="font-mono">{order.orderNumber}</span>
							<span>{formatDate(order.createdAt)}</span>
							<span class="font-mono tabular-nums">
								{formatIDR(order.paidAmount)} / {formatIDR(order.totalAmount)}
							</span>
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
				Belum ada order atas nama penulis ini.
			</p>
		{/if}
	</section>

	<section class="card overflow-hidden" aria-labelledby="judul-buku">
		<div class="card-header">
			<div>
				<h2 id="judul-buku" class="text-sm font-semibold">Buku</h2>
				<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
					{author.bookCount} proyek buku, {author.publishedCount} sudah terbit.
				</p>
			</div>
			<BookOpen class="size-4 text-ink-300 dark:text-ink-600" strokeWidth={1.5} />
		</div>
		{#if data.books.length > 0}
			<ul class="divide-y divide-ink-100 dark:divide-ink-800">
				{#each data.books as book (book.projectId)}
					<li class="px-5 py-3">
						<a
							href={`/projects/${book.projectId}`}
							class="inline-flex items-center gap-1 text-sm font-medium text-yale-700 hover:underline dark:text-yale-300"
						>
							{book.title} <ArrowRight class="size-3.5" />
						</a>
						<p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
							{statusOf(PROJECT_STATUS, book.status).label}{book.printStage
								? ` · cetak ${statusOf(PRINT_STAGE, book.printStage).label}`
								: ''}
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-5 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
				Belum ada proyek buku yang berjalan.
			</p>
		{/if}
	</section>
</div>
