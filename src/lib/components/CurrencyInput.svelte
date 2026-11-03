<script lang="ts">
	/**
	 * Input uang dengan pemisah ribuan saat tidak difokuskan.
	 *
	 * Masalah yang dipecahkan: `type="number"` menampilkan `1500000` polos, dan
	 * staf keuangan harus menghitung nol sendiri — sumber salah input yang
	 * mahal di dokumen finansial.
	 *
	 * Kontrak:
	 *  - saat fokus: nilai mentah (`1500000`) supaya mudah diedit dan lolos
	 *    validasi bawaan browser,
	 *  - saat blur: `1.500.000` supaya salah nol langsung terlihat,
	 *  - yang dikirim ke server selalu nilai mentah tanpa pemisah.
	 *
	 * Memakai `type="text"` + `inputmode="numeric"` (bukan `type="number"`)
	 * karena `type="number"` menolak titik ribuan dan di beberapa browser
	 * mengosongkan nilai yang tidak valid saat blur.
	 */
	let {
		name,
		value = 0,
		label,
		min = 0,
		max,
		required = false,
		placeholder = '0',
		hint = '',
		class: className = '',
		onvalue
	}: {
		name: string;
		value?: number | string | null;
		/** Label visual; juga menjadi `aria-label` bila tidak ada `<label>` luar. */
		label: string;
		min?: number;
		max?: number;
		required?: boolean;
		placeholder?: string;
		hint?: string;
		class?: string;
		/** Dipanggil setiap nilai mentah berubah (untuk pratinjau). */
		onvalue?: (value: number) => void;
	} = $props();

	/**
	 * Id stabil per instance. Dihitung lewat fungsi, bukan langsung di top-level,
	 * supaya tidak memicu peringatan "reference only captures the initial value".
	 */
	const id = (() => `currency-${name}-${Math.random().toString(36).slice(2, 8)}`)();

	/** Nilai awal dibaca sekali: komponen ini tidak dikendalikan dari luar. */
	function initialRaw(): number {
		return normalize(value);
	}

	/** Nilai mentah yang menjadi sumber kebenaran. */
	let raw = $state(initialRaw());

	let focused = $state(false);

	function normalize(input: number | string | null | undefined): number {
		if (input === null || input === undefined) return 0;
		const n = typeof input === 'number' ? input : Number.parseFloat(String(input).replace(/[^\d]/g, ''));
		return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
	}

	/** `1.500.000` — hanya untuk tampilan. */
	function grouped(n: number): string {
		return n.toLocaleString('id-ID');
	}

	const display = $derived(focused ? (raw === 0 ? '' : String(raw)) : grouped(raw));

	function onInput(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const digits = target.value.replace(/[^\d]/g, '');
		raw = digits ? Number.parseInt(digits, 10) : 0;
		/* Saat mengetik, jangan biarkan pemisah ribuan mengganggu kursor. */
		target.value = digits;
		onvalue?.(raw);
	}

	function onFocus(): void {
		focused = true;
	}

	function onBlur(event: FocusEvent): void {
		focused = false;
		const target = event.currentTarget as HTMLInputElement;
		target.value = grouped(raw);
	}
</script>

<div class={className}>
	{#if label}
		<label class="label" for={id}>{label}</label>
	{/if}
	<div class="relative mt-1">
		<span
			class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-400"
			aria-hidden="true">Rp</span
		>
		<input
			{id}
			{name}
			type="text"
			inputmode="numeric"
			autocomplete="off"
			class="field !pl-9 font-mono tabular-nums"
			value={display}
			{placeholder}
			{required}
			aria-label={label}
			aria-describedby={hint ? `${id}-hint` : undefined}
			min={min}
			max={max}
			oninput={onInput}
			onfocus={onFocus}
			onblur={onBlur}
		/>
	</div>
	{#if hint}
		<p id={`${id}-hint`} class="mt-1 text-[11px] text-ink-500 dark:text-ink-400">{hint}</p>
	{/if}
</div>
