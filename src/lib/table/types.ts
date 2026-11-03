import type { Snippet } from 'svelte';

/**
 * Definisi kolom adalah SATU-SATUNYA sumber data untuk tabel.
 *
 * Desktop merender `<table>`, ponsel merender kartu — keduanya membaca array
 * kolom yang sama dan `cell` snippet yang sama. Tidak ada markup data ganda
 * yang bisa melenceng saat salah satu sisi diperbarui.
 */

export type ColumnAlign = 'start' | 'end';

/**
 * Peran kolom saat dirender sebagai kartu di ponsel:
 *  - `primary`  judul kartu (biasanya nama/tautan utama)
 *  - `inline`   pasangan label–nilai rapat (default)
 *  - `block`    blok penuh dengan label di atas nilai
 *  - `hide`     tidak ditampilkan di kartu (mis. kolom aksi)
 */
export type MobileRole = 'primary' | 'inline' | 'block' | 'hide';

export type DataColumn<T> = {
	id: string;
	header: string;
	align?: ColumnAlign;
	mobile?: MobileRole;
	/** Kolom bisa diurutkan (desktop) — ponsel memakai kontrol urut terpisah. */
	sortable?: boolean;
	/** Isi sel; dipakai tabel dan kartu sekaligus. */
	cell: Snippet<[T]>;
};

export type SortState = { id: string; dir: 'asc' | 'desc' } | null;

/** Rentang hasil yang dibacakan ke pembaca layar. */
export function rangeLabel(from: number, to: number, total: number, noun: string): string {
	if (total === 0) return `Tidak ada ${noun} yang cocok.`;
	return `Menampilkan ${from}–${to} dari ${total} ${noun}.`;
}
