/**
 * Konfirmasi untuk aksi yang tidak bisa dibatalkan.
 *
 * Dipanggil dari `makeSubmit` sebelum request dikirim, sehingga keputusan
 * pengguna berada di jalur yang sama dengan submit: batal berarti tidak ada POST
 * dan tombol tidak pernah dikunci. Satu dialog dipasang sekali di AppShell.
 */

export type ConfirmFact = { label: string; value: string };

export type ConfirmRequest = {
	title: string;
	facts: ConfirmFact[];
	/** Konsekuensi yang harus dibaca sebelum menekan tombol (bukan "Yakin?"). */
	note?: string;
	confirmLabel: string;
	cancelLabel?: string;
	tone?: 'primary' | 'danger';
};

type PendingConfirm = ConfirmRequest & { id: number };

let nextId = 1;
let pending = $state<PendingConfirm | null>(null);
let resolver: ((accepted: boolean) => void) | null = null;

export const confirmState = {
	get current(): PendingConfirm | null {
		return pending;
	}
};

/** Menampilkan dialog dan menunggu pilihan pengguna (true = lanjutkan). */
export function requestConfirm(request: ConfirmRequest): Promise<boolean> {
	// Permintaan kedua saat dialog masih terbuka: batalkan yang pertama (batal),
	// lalu tampilkan yang baru supaya tidak ada dua promise menggantung.
	resolver?.(false);
	return new Promise<boolean>((resolve) => {
		resolver = resolve;
		pending = { ...request, id: nextId++ };
	});
}

export function settleConfirm(accepted: boolean): void {
	const resolve = resolver;
	resolver = null;
	pending = null;
	resolve?.(accepted);
}
