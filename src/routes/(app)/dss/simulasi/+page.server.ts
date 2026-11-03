import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '$db';
import { inventory, packages, scenarioSnapshots } from '$db/schema';
import { audit } from '$lib/server/services/auditDraft';
import { getDecisionSettings } from '$lib/server/services/dss';
import { ErpError } from '$lib/server/services/erpErrors';
import { computePrintCost } from '$lib/server/services/printing';
import { getPrintSettings } from '$lib/server/services/settings';
import { toNumber } from '$lib/server/services/money';
import type { Actions, PageServerLoad } from './$types';

const DSS_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;
const PM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	console.error('[dss/simulasi] aksi gagal:', e);
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Simulasi harga paket.
 *
 * HPP dihitung dengan fungsi yang sama yang dipakai mesin ERP
 * (`computePrintCost`) dan pengaturan tarif yang sama — tidak ada tarif kedua
 * di DSS yang bisa diam-diam berbeda dari faktur sebenarnya.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !DSS_ROLES.includes(role as (typeof DSS_ROLES)[number])) {
		error(403, 'Simulasi harga hanya untuk tim internal penerbitan.');
	}

	const [settings, rules, packageRows, scenarios, retailRows] = await Promise.all([
		getPrintSettings(),
		getDecisionSettings(),
		db
			.select({
				id: packages.id,
				code: packages.code,
				name: packages.name,
				basePrice: packages.basePrice,
				authorRoyaltyPct: packages.authorRoyaltyPct,
				downPaymentPct: packages.downPaymentPct
			})
			.from(packages)
			.where(eq(packages.isActive, true))
			.orderBy(asc(packages.name)),
		db
			.select()
			.from(scenarioSnapshots)
			.orderBy(desc(scenarioSnapshots.createdAt))
			.limit(10),
		db
			.select({ retailPrice: inventory.retailPrice })
			.from(inventory)
			.where(sql`${inventory.retailPrice} > 0`)
	]);

	/*
	 * Harga jual per eksemplar sengaja TIDAK diambil dari `packages.base_price`:
	 * itu harga kontrak jasa penerbitan, bukan harga buku di toko. Dua model
	 * bisnis ini hidup berdampingan di ERP, dan mencampurnya membuat simulasi
	 * menjanjikan margin 98% yang tidak pernah terjadi.
	 */
	const retailPrices = retailRows.map((row) => toNumber(row.retailPrice)).filter((v) => v > 0);
	const suggestedPrice =
		retailPrices.length > 0
			? Math.round(retailPrices.reduce((sum, value) => sum + value, 0) / retailPrices.length)
			: 100_000;

	return {
		printSettings: settings,
		rules: rules.title,
		suggestedPrice,
		packages: packageRows.map((row) => ({
			...row,
			basePriceNum: toNumber(row.basePrice),
			authorRoyaltyPctNum: toNumber(row.authorRoyaltyPct),
			downPaymentPctNum: toNumber(row.downPaymentPct)
		})),
		scenarios: scenarios.map((row) => ({
			id: row.id,
			name: row.name,
			kind: row.kind,
			input: row.input,
			result: row.result,
			createdAt: row.createdAt
		}))
	};
};

export const actions: Actions = {
	/** Menyimpan skenario beserta hasil yang dilihat pembuatnya. */
	save: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menyimpan skenario.' });
		}

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (name.length < 3) return fail(400, { message: 'Beri nama skenario (minimal 3 karakter).' });

		let input: Record<string, unknown>;
		let result: Record<string, unknown>;
		try {
			input = JSON.parse(String(form.get('input') ?? '{}')) as Record<string, unknown>;
			result = JSON.parse(String(form.get('result') ?? '{}')) as Record<string, unknown>;
		} catch {
			return fail(400, { message: 'Data simulasi tidak valid. Hitung ulang lalu simpan lagi.' });
		}

		try {
			/* HPP dihitung ulang di server: angka dari klien tidak dipercaya. */
			const price = toNumber(String(input.price ?? 0));
			const discountPct = toNumber(String(input.discountPct ?? 0));
			const quantity = Math.max(1, Math.round(toNumber(String(input.quantity ?? 1))));

			if (price <= 0) return fail(400, { message: 'Harga jual harus lebih dari nol.' });

			const settings = await getPrintSettings();
			const cost = computePrintCost(
				{
					pageCount: Math.round(toNumber(String(input.pageCount ?? 0))),
					paperType: String(input.paperType ?? 'BOOKPAPER') as 'BOOKPAPER' | 'HVS' | 'ART_PAPER',
					bookSize: String(input.bookSize ?? 'A5') as 'A5' | 'B5' | 'UNESCO' | 'A4' | 'CUSTOM',
					binding: String(input.binding ?? 'PERFECT_BINDING') as
						| 'PERFECT_BINDING'
						| 'SPIRAL'
						| 'HARDCOVER'
						| 'STAPLE',
					lamination: String(input.lamination ?? 'DOFF') as 'NONE' | 'DOFF' | 'GLOSSY',
					isFullColor: input.isFullColor === true,
					quantity
				},
				settings
			);

			const netPrice = Math.round(price * (1 - Math.min(100, Math.max(0, discountPct)) / 100));
			const unitCost = toNumber(cost.costPerUnit);
			const marginPerCopy = netPrice - unitCost;
			const marginPct = netPrice > 0 ? Math.round((marginPerCopy / netPrice) * 100) : 0;

			const [row] = await db
				.insert(scenarioSnapshots)
				.values({
					name,
					kind: 'price',
					input,
					result: {
						...(result ?? {}),
						unitCost,
						netPrice,
						marginPerCopy,
						marginPct,
						quantity,
						totalCost: toNumber(cost.totalCost)
					},
					createdBy: profile.id
				})
				.returning({ id: scenarioSnapshots.id });

			await audit({
				actor: profile,
				action: 'scenario.saved',
				entityType: 'decision',
				entityId: row?.id ?? null,
				summary: `Menyimpan skenario harga “${name}”: margin ${marginPct}% pada ${quantity} eksemplar.`,
				context: { input, marginPct, unitCost, netPrice }
			});

			return { ok: true, message: `Skenario “${name}” disimpan.` };
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Menghapus skenario yang sudah tidak relevan. */
	delete: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menghapus skenario.' });
		}

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Skenario tidak dipilih.' });

		try {
			await db.delete(scenarioSnapshots).where(and(eq(scenarioSnapshots.id, id)));
			return { ok: true, message: 'Skenario dihapus.' };
		} catch (e) {
			return toFailure(e);
		}
	}
};
