import type { SubmitFunction } from '@sveltejs/kit';
import { pushToast } from '$lib/client/toast.svelte';
import { requestConfirm, type ConfirmRequest } from '$lib/client/confirm.svelte';

/**
 * Satu handler untuk semua `use:enhance` di aplikasi.
 *
 * Tiga masalah ditutup bersamaan:
 *
 *  1. **Double submit.** `locked` adalah `Set` biasa (bukan state reaktif), diisi
 *     secara sinkron sebelum request dikirim. Dua tap cepat di ponsel: tap kedua
 *     menemukan kunci yang sudah ada dan dibatalkan sebelum `fetch`. State
 *     reaktif hanya untuk tampilan tombol, tidak dipakai sebagai penjaga.
 *  2. **Request id.** Setiap submit membuat `requestId` yang ikut dikirim. Server
 *     memakainya (lihat `runIdempotent`) untuk menolak replay POST.
 *  3. **Umpan balik.** Tombol berubah label + spinner + `aria-busy`; hasilnya
 *     muncul sebagai toast, bukan blok pesan yang menetap di tengah halaman.
 */

export type ConfirmContext = {
	formElement: HTMLFormElement;
	submitter: HTMLElement | null;
	formData: FormData;
};

export type SubmitConfig = {
	/** Kunci aksi, mis. `pay-invoice`. Juga dipakai sebagai `data-action`. */
	key: string;
	/** Judul toast saat sukses. */
	successTitle?: string;
	/** Judul toast saat server menolak. */
	errorTitle?: string;
	/**
	 * Aksi tidak bisa dibatalkan → minta konfirmasi dulu. Menerima form, tombol
	 * yang ditekan, dan isi form, karena beberapa tombol bisa hidup di satu form
	 * (mis. Setujui / Bayar / Tolak pada penarikan).
	 */
	confirm?: (context: ConfirmContext) => ConfirmRequest | null;
	/** Dipanggil setelah sukses (mis. menutup panel form). */
	onSuccess?: () => void;
	onFailure?: () => void;
	/** Jangan reset isi form setelah sukses. */
	keepValues?: boolean;
};

/** Form yang sudah dikonfirmasi, agar submit ulang tidak bertanya dua kali. */
const confirmed = new WeakMap<HTMLFormElement, Set<string>>();

function takeConfirmation(form: HTMLFormElement, key: string): boolean {
	const set = confirmed.get(form);
	if (!set?.has(key)) return false;
	set.delete(key);
	return true;
}

function markConfirmed(form: HTMLFormElement, key: string): void {
	const set = confirmed.get(form) ?? new Set<string>();
	set.add(key);
	confirmed.set(form, set);
}

export type FormHandler = {
	/** `true` bila tombol untuk kunci ini sedang mengirim request. */
	isBusy: (key: string) => boolean;
	/**
	 * `true` hanya untuk tombol yang benar-benar ditekan. Dipakai form dengan
	 * beberapa tombol submit (Setujui / Bayar / Tolak): semua tombol dinonaktifkan
	 * saat aksi berjalan, tetapi hanya satu yang menampilkan spinner.
	 */
	isBusyAction: (key: string, value: string | null | undefined) => boolean;
	/** `true` bila ada aksi apa pun yang sedang berjalan di halaman ini. */
	readonly anyBusy: boolean;
	make: (config: SubmitConfig) => SubmitFunction;
};

export function createFormHandler(): FormHandler {
	/**
	 * Sumber kebenaran penjaga: `Set` biasa, ditulis sinkron. `active` hanya
	 * cermin reaktif untuk dirender — dibutuhkan karena menulis ke elemen
	 * tombol langsung (atribut disabled) di tengah handler membuat browser
	 * tidak konsisten dengan state Svelte.
	 */
	const locked = new Set<string>();
	const confirming = new Set<string>();

	let active = $state<string[]>([]);
	let activeValue = $state<Record<string, string | null>>({});

	function publish(): void {
		active = [...locked];
	}

	function setValue(key: string, value: string | null): void {
		activeValue = { ...activeValue, [key]: value };
	}

	function clearValue(key: string): void {
		const next = { ...activeValue };
		delete next[key];
		activeValue = next;
	}

	function make(config: SubmitConfig): SubmitFunction {
		return async ({ formElement, submitter, cancel, formData }) => {
			const key = formElement?.dataset.action ?? config.key;

			/*
			 * Konfirmasi berjalan sebelum kunci diambil dan sebelum fetch:
			 * submit dibatalkan, dialog tampil, lalu form dikirim ulang lewat
			 * `requestSubmit(submitter)` supaya tombol `name="action"` tetap ikut.
			 */
			if (config.confirm && formElement && !takeConfirmation(formElement, key)) {
				/* Dialog masih terbuka untuk aksi ini: tap kedua diabaikan. */
				if (confirming.has(key)) {
					cancel();
					return;
				}

				const request = config.confirm({
					formElement,
					submitter: submitter instanceof HTMLElement ? submitter : null,
					formData
				});

				if (request) {
					cancel();
					confirming.add(key);
					const accepted = await requestConfirm(request).finally(() => confirming.delete(key));
					if (!accepted) return;
					markConfirmed(formElement, key);
					formElement.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined);
					return;
				}
			}

			/* Kunci sinkron — inilah penjaga double-submit yang sebenarnya. */
			if (locked.has(key)) {
				cancel();
				return;
			}
			locked.add(key);
			const value =
				submitter instanceof HTMLButtonElement && submitter.value ? submitter.value : null;
			setValue(key, value);
			publish();

			const requestId =
				typeof crypto !== 'undefined' && 'randomUUID' in crypto
					? crypto.randomUUID()
					: `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
			formData.set('requestId', requestId);

			return async ({ result, update }) => {
				locked.delete(key);
				clearValue(key);
				publish();

				if (result.type === 'failure') {
					const data = result.data as Record<string, unknown> | undefined;
					const message =
						(typeof data?.message === 'string' && data.message) ||
						'Aksi tidak dapat diselesaikan. Coba lagi.';
					pushToast({
						tone: 'error',
						title: config.errorTitle ?? 'Gagal diproses',
						description: message
					});
					config.onFailure?.();
					await update({ reset: false });
					return;
				}

				if (result.type === 'error') {
					pushToast({
						tone: 'error',
						title: 'Koneksi bermasalah',
						description: 'Server tidak dapat dihubungi. Periksa jaringan, lalu coba lagi.'
					});
					config.onFailure?.();
					await update({ reset: false });
					return;
				}

				if (result.type === 'success') {
					const data = result.data as Record<string, unknown> | undefined;
					const message = typeof data?.message === 'string' ? data.message : undefined;

					if (data?.ok) {
						/*
						 * `replayed` = server mengenali kunci idempoten ini dan memakai
						 * hasil pertama. Bukan kegagalan, tetapi juga bukan perubahan
						 * baru — sampaikan sebagai info, bukan sukses kedua.
						 */
						if (data.replayed) {
							pushToast({
								tone: 'info',
								title: 'Sudah diproses sebelumnya',
								description: message
							});
						} else {
							pushToast({
								tone: 'success',
								title: config.successTitle ?? 'Berhasil',
								description: message
							});
						}
						config.onSuccess?.();
					} else if (message) {
						pushToast({
							tone: 'info',
							title: config.errorTitle ?? 'Tidak ada perubahan',
							description: message
						});
					}

					await update({ reset: config.keepValues ? false : true });
					return;
				}

				await update();
			};
		};
	}

	return {
		get anyBusy() {
			return active.length > 0;
		},
		isBusy: (key: string) => active.includes(key),
		isBusyAction: (key: string, value: string | null | undefined) =>
			active.includes(key) && (activeValue[key] ?? null) === (value ?? null),
		make
	};
}
