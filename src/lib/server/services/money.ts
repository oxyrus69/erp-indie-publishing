/**
 * Helper uang untuk nilai IDR.
 * Semua nilai disimpan sebagai `numeric(14,2)` (string di Postgres) agar tidak
 * kehilangan presisi. Perhitungan dilakukan dalam satuan rupiah bulat karena
 * IDR tidak memakai sen dalam praktik penerbitan.
 */

export type MoneyInput = string | number | null | undefined;

export function toNumber(value: MoneyInput): number {
	if (value === null || value === undefined) return 0;
	const n = typeof value === 'number' ? value : Number.parseFloat(value);
	return Number.isFinite(n) ? n : 0;
}

/** Bulatkan ke rupiah terdekat. */
export function rupiah(value: number): number {
	return Math.round(value);
}

/** Format untuk kolom numeric(14,2). */
export function toMoneyString(value: number): string {
	return rupiah(value).toFixed(2);
}

export function multiply(amount: MoneyInput, factor: number): string {
	return toMoneyString(toNumber(amount) * factor);
}

export function sumMoney(values: MoneyInput[]): string {
	return toMoneyString(values.reduce<number>((acc, v) => acc + toNumber(v), 0));
}

/** Format tampilan: Rp 1.500.000 */
export function formatIDR(value: MoneyInput): string {
	const n = toNumber(value);
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0
	}).format(n);
}

export function percentOf(amount: MoneyInput, pct: MoneyInput): string {
	return toMoneyString((toNumber(amount) * toNumber(pct)) / 100);
}
