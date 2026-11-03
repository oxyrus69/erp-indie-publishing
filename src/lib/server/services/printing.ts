import { computePrintCostPure, type PrintCostBreakdown, type PrintCostInput } from '$lib/printMath';
import { getPrintSettings, type PrintSettings } from './settings';

/**
 * Perhitungan HPP cetak.
 *
 * Rumusnya tinggal di `$lib/printMath.ts` karena halaman simulasi DSS
 * menghitung HPP di browser dan harus memakai rumus yang persis sama dengan
 * mesin ERP. File ini hanya menyambungkan rumus itu ke pengaturan di database.
 *
 * Tarif tidak berupa konstanta di sini: semuanya berasal dari pengaturan
 * (`app_settings.print`) yang bisa diubah tim keuangan tanpa deploy. Nilai
 * default tinggal di `settings.ts` supaya kalkulasi tetap lengkap sebelum
 * pengaturan pernah disimpan.
 *
 * Dua bentuk fungsi tersedia:
 *  - `computePrintCost(input, settings)` — murni, sinkron, tanpa I/O. Dipakai
 *    saat pemanggil sudah punya pengaturan (mis. pratinjau di halaman proyek).
 *  - `calculatePrintCost(input)` — membaca pengaturan lalu menghitung.
 */

export type { PrintCostBreakdown, PrintCostInput };

export function computePrintCost(input: PrintCostInput, settings: PrintSettings): PrintCostBreakdown {
	return computePrintCostPure(input, settings);
}

/** Versi async: membaca pengaturan terbaru lalu menghitung. */
export async function calculatePrintCost(input: PrintCostInput): Promise<PrintCostBreakdown> {
	return computePrintCostPure(input, await getPrintSettings());
}
