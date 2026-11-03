import { formatIDR } from '$lib/ui';

/**
 * Format ringkas untuk sumbu grafik.
 *
 * Sumbu tidak muat menampilkan "Rp 8.050.000" berulang kali. Dipakai satuan
 * juta/ribu dengan satu desimal, dan hanya bila angkanya memang besar —
 * nilai kecil tetap ditulis apa adanya agar tidak menyesatkan.
 */
export function compactIDR(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.0', '')} M`;
	if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')} jt`;
	if (abs >= 1_000) return `${Math.round(value / 1_000)} rb`;
	return String(Math.round(value));
}

/** `Rp` penuh untuk tooltip: nilai persis lebih penting daripada ringkas. */
export function tooltipIDR(value: number): string {
	return formatIDR(value);
}

/** Ringkasan teks untuk pembaca layar, karena SVG tidak terbaca baik. */
export function seriesSummary(points: { label: string; value: number }[], noun: string): string {
	if (points.length === 0) return `Tidak ada ${noun}.`;
	const total = points.reduce((acc, p) => acc + p.value, 0);
	const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
	if (total === 0) return `${noun} bernilai nol pada seluruh periode.`;
	return `${noun}: total ${formatIDR(total)}, tertinggi ${formatIDR(peak.value)} pada ${peak.label}.`;
}
