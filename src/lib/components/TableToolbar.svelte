<script lang="ts">
	import { Search, X } from 'lucide-svelte';

	/**
	 * Kontrol di atas tabel: pencarian, filter, jumlah per halaman.
	 *
	 * Semua kontrol berupa `<form method="get">` biasa, jadi:
	 *  - bekerja tanpa JavaScript,
	 *  - URL bisa disalin ke rekan kerja,
	 *  - tombol back browser mengembalikan kombinasi filter sebelumnya.
	 *
	 * `hidden` menyimpan sort/arah/halaman yang sedang aktif supaya mengubah
	 * filter tidak diam-diam mereset urutan.
	 */
	let {
		action,
		query = '',
		searchPlaceholder = 'Cari…',
		/**
		 * Label aksesibel untuk kolom pencarian. Placeholder saja tidak cukup:
		 * placeholder hilang begitu pengguna mengetik, dan pembaca layar tidak
		 * selalu membacanya sebagai nama kontrol.
		 */
		searchLabel,
		filters = [],
		size,
		sizes = [10, 25, 50, 100],
		hidden = {},
		resetHref,
		onreset
	}: {
		action: string;
		query?: string;
		searchPlaceholder?: string;
		searchLabel?: string;
		filters?: { name: string; label: string; value: string; options: { value: string; label: string }[] }[];
		size?: number;
		sizes?: readonly number[];
		hidden?: Record<string, string | number>;
		/**
		 * Tujuan "Hapus filter". Default `action` (tanpa param). Halaman yang
		 * punya dimensi lain yang harus bertahan (mis. periode) meneruskan
		 * tautan yang masih membawanya.
		 */
		resetHref?: string;
		onreset?: () => void;
	} = $props();

	const searchName = $derived(searchLabel ?? searchPlaceholder);

	const hasFilter = $derived(
		Boolean(query) || filters.some((f) => f.value !== '') 
	);
</script>

<form
	{action}
	method="GET"
	class="mb-3 flex flex-wrap items-center gap-2"
	role="search"
	aria-label="Saring dan urutkan daftar"
>
	{#each Object.entries(hidden) as [name, hiddenValue] (name)}
		<input type="hidden" {name} value={hiddenValue} />
	{/each}

	<div class="relative min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-64">
		<Search
			class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400"
			strokeWidth={1.75}
		/>
		<input
			type="search"
			name="q"
			value={query}
			placeholder={searchPlaceholder}
			aria-label={searchName}
			class="field w-full !py-1.5 !pl-8 !text-xs"
		/>
	</div>

	{#each filters as filter (filter.name)}
		<label class="sr-only" for={`filter-${filter.name}`}>{filter.label}</label>
		<select
			id={`filter-${filter.name}`}
			name={filter.name}
			class="field !py-1.5 !pl-2.5 !pr-8 !text-xs"
			style="width:auto;max-width:100%"
			aria-label={filter.label}
		>
			<option value="">{filter.label}: semua</option>
			{#each filter.options as option (option.value)}
				<option value={option.value} selected={filter.value === option.value}>
					{filter.label}: {option.label}
				</option>
			{/each}
		</select>
	{/each}

	{#if size !== undefined}
		<label class="sr-only" for="table-size">Baris per halaman</label>
		<select
			id="table-size"
			name="size"
			class="field !py-1.5 !pl-2.5 !pr-8 !text-xs"
			style="width:auto;max-width:100%"
			aria-label="Baris per halaman"
		>
			{#each sizes as option (option)}
				<option value={option} selected={size === option}>{option} / halaman</option>
			{/each}
		</select>
	{/if}

	<button type="submit" class="btn-secondary !py-1.5 !text-xs">Terapkan</button>

	{#if hasFilter}
		<a
			href={resetHref ?? action}
			class="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-ink-500 transition hover:bg-ink-100 hover:text-ink-700 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-200"
			onclick={() => onreset?.()}
		>
			<X class="size-3" strokeWidth={2} /> Hapus filter
		</a>
	{/if}
</form>
