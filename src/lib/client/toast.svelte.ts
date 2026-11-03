/**
 * Toast global — satu-satunya kanal umpan balik aksi form.
 *
 * Kenapa store modul, bukan state per halaman: aksi terjadi di tengah halaman
 * (verifikasi invoice, setujui penarikan) dan pesan inline lama menetap sampai
 * navigasi berikutnya. Toast muncul di satu tempat, dibacakan pembaca layar,
 * lalu hilang sendiri atau ditutup pengguna.
 */

export type ToastTone = 'success' | 'error' | 'info';

export type Toast = {
	id: number;
	tone: ToastTone;
	title: string;
	description?: string;
	/** Timer aktif; disimpan agar bisa dijeda saat kursor/fokus di atas toast. */
	timeout: number;
};

const DEFAULT_TIMEOUT: Record<ToastTone, number> = {
	success: 6000,
	info: 6000,
	/* Kegagalan finansial biasanya perlu dibaca dua kali. */
	error: 12000
};

let nextId = 1;
let items = $state<Toast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const toasts = {
	get items(): Toast[] {
		return items;
	}
};

function schedule(id: number, ms: number): void {
	const timer = setTimeout(() => dismissToast(id), ms);
	timers.set(id, timer);
}

function clearTimer(id: number): void {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
}

export function pushToast(input: {
	tone: ToastTone;
	title: string;
	description?: string;
	timeout?: number;
}): number {
	const id = nextId++;
	const timeout = input.timeout ?? DEFAULT_TIMEOUT[input.tone];

	// Maksimal tiga toast terlihat: yang paling lama keluar lebih dulu.
	if (items.length >= 3) dismissToast(items[0]!.id);

	items = [...items, { id, tone: input.tone, title: input.title, description: input.description, timeout }];
	schedule(id, timeout);
	return id;
}

export function dismissToast(id: number): void {
	clearTimer(id);
	items = items.filter((toast) => toast.id !== id);
}

/** Menahan toast saat pengguna membaca atau mengarahkan kursor ke atasnya. */
export function pauseToast(id: number): void {
	clearTimer(id);
}

export function resumeToast(id: number): void {
	const toast = items.find((item) => item.id === id);
	if (!toast) return;
	clearTimer(id);
	schedule(id, Math.min(toast.timeout, 4000));
}
