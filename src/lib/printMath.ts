/**
 * Rumus HPP cetak — murni, tanpa I/O.
 *
 * Kenapa dipisah ke `$lib` (bukan tetap di `server/services/printing.ts`):
 * halaman simulasi DSS menghitung HPP di browser saat pengguna menggeser
 * angka, dan itu harus memakai rumus yang **persis sama** dengan yang dipakai
 * mesin ERP saat membuat order cetak. Dua salinan rumus akan melenceng, dan
 * simulasi yang melenceng lebih berbahaya daripada tidak ada simulasi.
 *
 * Tidak ada impor database di sini. Tarif tetap datang dari luar (pengaturan),
 * jadi modul ini aman dipakai di klien maupun server.
 */

export type PaperType = 'BOOKPAPER' | 'HVS' | 'ART_PAPER';
export type BookSize = 'A5' | 'B5' | 'UNESCO' | 'A4' | 'CUSTOM';
export type BindingType = 'PERFECT_BINDING' | 'SPIRAL' | 'HARDCOVER' | 'STAPLE';
export type LaminationType = 'NONE' | 'DOFF' | 'GLOSSY';

export type PrintRateTable = {
	paperRatePerPage: Record<PaperType, number>;
	sizeMultiplier: Record<BookSize, number>;
	bindingCost: Record<BindingType, number>;
	laminationCost: Record<LaminationType, number>;
	fullColorMultiplier: number;
	minPages: number;
	vatPct: number;
};

export type PrintCostInput = {
	pageCount: number;
	paperType: PaperType;
	bookSize: BookSize;
	binding: BindingType;
	lamination: LaminationType;
	isFullColor: boolean;
	quantity: number;
};

export type PrintCostBreakdown = {
	costPerUnit: string;
	totalCost: string;
	quantity: number;
	vatPct: number;
	vatAmount: string;
	grandTotal: string;
	breakdown: {
		paperAndInk: number;
		binding: number;
		lamination: number;
		costPerUnit: number;
	};
};

/** Rupiah bulat: IDR tidak memakai sen dalam praktik penerbitan. */
export function roundIDR(value: number): number {
	return Math.round(value);
}

/** Format untuk kolom numeric(14,2). */
export function moneyString(value: number): string {
	return roundIDR(value).toFixed(2);
}

/**
 * Menghitung HPP cetak per eksemplar dan total.
 * Rumus: (halaman efektif × tarif kertas × pengali ukuran × [full color])
 *        + jilid + laminasi, lalu PPN bila diaktifkan.
 */
export function computePrintCostPure(
	input: PrintCostInput,
	settings: PrintRateTable
): PrintCostBreakdown {
	const pages = Math.max(settings.minPages, Math.ceil(input.pageCount || 0));
	const quantity = Math.max(1, Math.floor(input.quantity || 1));

	const colorMultiplier = input.isFullColor ? settings.fullColorMultiplier : 1;
	const paperAndInk = roundIDR(
		pages *
			settings.paperRatePerPage[input.paperType] *
			settings.sizeMultiplier[input.bookSize] *
			colorMultiplier
	);
	const binding = settings.bindingCost[input.binding];
	const lamination = settings.laminationCost[input.lamination];

	const costPerUnit = paperAndInk + binding + lamination;
	const subtotal = costPerUnit * quantity;
	const vatAmount = roundIDR((subtotal * settings.vatPct) / 100);

	return {
		costPerUnit: moneyString(costPerUnit),
		totalCost: moneyString(subtotal),
		quantity,
		vatPct: settings.vatPct,
		vatAmount: moneyString(vatAmount),
		grandTotal: moneyString(subtotal + vatAmount),
		breakdown: { paperAndInk, binding, lamination, costPerUnit }
	};
}

/* -------------------------------------------------------------------------- */
/*                          SIMULASI HARGA (DSS)                              */
/* -------------------------------------------------------------------------- */

export type PriceScenarioInput = PrintCostInput & {
	/** Harga jual per eksemplar sebelum diskon. */
	price: number;
	discountPct: number;
	/** Royalti penulis (% dari laba kotor per eksemplar). */
	royaltyPct: number;
};

export type PriceScenarioResult = {
	unitCost: number;
	vatPerUnit: number;
	netPrice: number;
	marginPerCopy: number;
	marginPct: number;
	royaltyPerCopy: number;
	publisherPerCopy: number;
	/** Eksemplar yang harus terjual agar total HPP tertutup. */
	breakEvenCopies: number;
	totalCost: number;
	totalRevenue: number;
	totalMargin: number;
	/** Harga minimum agar margin tepat di ambang. */
	minPriceForTarget: number;
};

/**
 * Simulasi satu paket.
 *
 * `royaltyPerCopy` dihitung dari laba kotor (harga bersih − HPP), sama seperti
 * `netRoyalty` pada `recordBookSale`. Kalau rumusnya berbeda, simulasi akan
 * menjanjikan royalti yang tidak pernah dibayar.
 */
export function simulatePrice(
	input: PriceScenarioInput,
	settings: PrintRateTable,
	targetMarginPct: number
): PriceScenarioResult {
	const cost = computePrintCostPure({ ...input, quantity: input.quantity }, settings);
	const unitCost = cost.breakdown.costPerUnit;
	const vatPerUnit = Math.round((unitCost * settings.vatPct) / 100);

	const discount = Math.min(100, Math.max(0, input.discountPct));
	const netPrice = Math.round(input.price * (1 - discount / 100));

	const marginPerCopy = netPrice - unitCost;
	const marginPct = netPrice > 0 ? Math.round((marginPerCopy / netPrice) * 100) : 0;

	const royaltyPerCopy = Math.max(
		0,
		Math.round(marginPerCopy * (Math.max(0, input.royaltyPct) / 100))
	);
	const publisherPerCopy = marginPerCopy - royaltyPerCopy;

	const totalCost = unitCost * input.quantity;
	const totalRevenue = netPrice * input.quantity;
	const breakEvenCopies =
		marginPerCopy > 0 ? Math.ceil(totalCost / marginPerCopy) : Number.POSITIVE_INFINITY;

	const minPriceForTarget =
		targetMarginPct < 100
			? Math.ceil(unitCost / (1 - targetMarginPct / 100) / (1 - discount / 100))
			: netPrice;

	return {
		unitCost,
		vatPerUnit,
		netPrice,
		marginPerCopy,
		marginPct,
		royaltyPerCopy,
		publisherPerCopy,
		breakEvenCopies: Number.isFinite(breakEvenCopies) ? breakEvenCopies : 0,
		totalCost,
		totalRevenue,
		totalMargin: totalRevenue - totalCost,
		minPriceForTarget
	};
}
