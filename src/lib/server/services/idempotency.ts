import { and, eq, lt } from 'drizzle-orm';
import { db } from '$db';
import { idempotencyKeys } from '$db/schema';
import { ErpError } from './erpErrors';

/**
 * Idempotensi aksi form (POST) yang mengubah status finansial.
 *
 * Kontrak:
 *  - Klien mengirim `requestId` (UUID) pada setiap submit yang benar-benar
 *    ditekan pengguna. Kunci sengaja dibuat di klien supaya dua tap cepat
 *    mengirim kunci yang sama.
 *  - `runIdempotent` mencoba `insert ... on conflict do nothing`. Hanya satu
 *    request yang berhasil menyisipkan baris, jadi hanya satu yang menjalankan
 *    `work()`. Request lain menunggu baris itu selesai lalu memakai hasilnya.
 *  - Bila `work()` gagal (ErpError), baris kunci dihapus agar pengguna bisa
 *    mencoba lagi dengan kunci baru tanpa terjebak hasil lama.
 *
 * Tanpa kolom `requestId` (form tanpa JS / klien lama) aksi tetap berjalan —
 * guard utama untuk kasus itu adalah kunci tombol di browser.
 */

const SCOPE_TTL_HOURS = 48;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** UUID v4-ish; cukup ketat untuk menolak nilai asal-asalan dari klien. */
const REQUEST_ID_RE = /^[0-9a-zA-Z_-]{8,64}$/;

export function readRequestId(form: FormData): string | null {
	const raw = String(form.get('requestId') ?? '').trim();
	return REQUEST_ID_RE.test(raw) ? raw : null;
}

/**
 * Membersihkan kunci lama. Dipanggil sesekali (1 dari 20 request) agar tabel
 * tidak tumbuh tanpa batas tanpa perlu cron terpisah.
 */
async function pruneExpired(): Promise<void> {
	const cutoff = new Date(Date.now() - SCOPE_TTL_HOURS * 3_600_000);
	await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, cutoff));
}

let pruneCounter = 0;

export type IdempotentOutcome<T> = { value: T; replayed: boolean };

export async function runIdempotent<T>(params: {
	scope: string;
	actorId: string;
	requestId: string | null;
	work: () => Promise<T>;
	/** Dipakai untuk menandai hasil yang bukan objek (mis. string) di jsonb. */
	serialize?: (value: T) => Record<string, unknown>;
	deserialize?: (row: Record<string, unknown>) => T;
}): Promise<IdempotentOutcome<T>> {
	const { scope, actorId, requestId, work } = params;

	// Tanpa requestId tidak ada yang bisa dijadikan kunci: jalankan langsung.
	if (!requestId) return { value: await work(), replayed: false };

	const key = `${scope}:${actorId}:${requestId}`;

	if (++pruneCounter % 20 === 0) {
		await pruneExpired().catch(() => {});
	}

	const [claimed] = await db
		.insert(idempotencyKeys)
		.values({ key, scope, actorId, result: null })
		.onConflictDoNothing({ target: idempotencyKeys.key })
		.returning({ key: idempotencyKeys.key });

	/* -------------------------- Request pertama menang ------------------------- */
	if (claimed) {
		try {
			const value = await work();
			const payload = params.serialize
				? params.serialize(value)
				: (value as unknown as Record<string, unknown>);
			await db
				.update(idempotencyKeys)
				.set({ result: payload ?? {} })
				.where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, scope)));
			return { value, replayed: false };
		} catch (e) {
			// Aksi gagal: lepaskan kunci supaya pengguna bisa mencoba lagi.
			await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key)).catch(() => {});
			throw e;
		}
	}

	/* --------------------- Request berikutnya memakai hasil -------------------- */
	// Aksi pertama mungkin masih berjalan; tunggu hasilnya sebentar.
	for (let attempt = 0; attempt < 25; attempt++) {
		const [row] = await db
			.select({ result: idempotencyKeys.result })
			.from(idempotencyKeys)
			.where(eq(idempotencyKeys.key, key))
			.limit(1);

		if (!row) break; // baris dibersihkan (aksi sebelumnya gagal) → coba jalankan sendiri
		if (row.result && Object.keys(row.result).length > 0) {
			const value = params.deserialize
				? params.deserialize(row.result)
				: (row.result as unknown as T);
			return { value, replayed: true };
		}
		await sleep(200);
	}

	/*
	 * Kunci masih kosong setelah ditunggu. Jangan jalankan ulang aksi: bila
	 * request pertama ternyata hanya lambat, menjalankan dua kali justru
	 * menggandakan efek finansial. Pengguna cukup menekan tombol lagi — itu
	 * membuat requestId baru, jadi tidak terjebak kunci ini.
	 */
	throw new ErpError(
		'ALREADY_PROCESSED',
		'Aksi ini masih diproses. Tunggu sebentar, lalu periksa status terbaru sebelum mengulang.'
	);
}
