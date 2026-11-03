import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$db';
import { inventory } from '$db/schema';
import { audit } from '$lib/server/services/auditDraft';
import { ErpError } from '$lib/server/services/erpErrors';
import { getDecisionSettings, titleFacts, titleRecommendations } from '$lib/server/services/dss';
import type { Actions, PageServerLoad } from './$types';

const DSS_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;
const PM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	console.error('[dss/judul] aksi gagal:', e);
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Keputusan per judul.
 *
 * Satu tabel menjawab empat pertanyaan sekaligus: mana yang harus dicetak
 * ulang, mana yang marginnya tipis, mana yang modalnya tertahan, dan mana yang
 * belum bisa dinilai karena HPP-nya belum nyata (belum pernah cetak).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !DSS_ROLES.includes(role as (typeof DSS_ROLES)[number])) {
		error(403, 'Keputusan judul hanya untuk tim internal penerbitan.');
	}

	const rules = await getDecisionSettings();
	const facts = await titleFacts();
	const recommendations = titleRecommendations(facts, rules.title);
	const byKey = new Map(recommendations.map((rec) => [`${rec.kind}:${rec.entity.id}`, rec]));

	const rows = facts
		.map((fact) => ({
			...fact,
			decision:
				fact.daysOfStock !== null &&
				fact.daysOfStock <= rules.title.reorderCoverDays &&
				fact.sold30 >= rules.title.slowMoverPerMonth
					? ('reorder' as const)
					: fact.sold30 < rules.title.slowMoverPerMonth && fact.stockValue >= rules.title.deadStockValue
						? ('dead_stock' as const)
						: fact.marginPct < rules.title.minMarginPct && fact.marginPerCopy > 0
							? ('thin_margin' as const)
							: fact.hasRealCost
								? ('healthy' as const)
								: ('unknown' as const),
			key: byKey.get(`reorder:${fact.projectId}`)?.key ?? `title:watch:${fact.projectId}`
		}))
		.sort((a, b) => {
			const rank = { reorder: 0, dead_stock: 1, thin_margin: 2, healthy: 3, unknown: 4 } as const;
			return rank[a.decision] - rank[b.decision] || b.stockValue - a.stockValue;
		});

	return {
		rows,
		rules: rules.title,
		counts: {
			reorder: rows.filter((row) => row.decision === 'reorder').length,
			deadStock: rows.filter((row) => row.decision === 'dead_stock').length,
			thinMargin: rows.filter((row) => row.decision === 'thin_margin').length,
			healthy: rows.filter((row) => row.decision === 'healthy').length,
			unknown: rows.filter((row) => row.decision === 'unknown').length
		},
		totalStockValue: rows.reduce((sum, row) => sum + row.stockValue, 0)
	};
};

export const actions: Actions = {
	/** Menyimpan harga retail baru dari tabel keputusan. */
	setPrice: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah harga retail.' });
		}

		const form = await request.formData();
		const projectId = String(form.get('projectId') ?? '').trim();
		const rawPrice = String(form.get('retailPrice') ?? '').replace(/[^\d]/g, '');
		const price = Number(rawPrice);

		if (!projectId) return fail(400, { message: 'Judul tidak dipilih.' });
		if (!Number.isFinite(price) || price <= 0) {
			return fail(400, { message: 'Harga retail harus lebih dari nol.' });
		}

		try {
			const [current] = await db
				.select({ id: inventory.id, retailPrice: inventory.retailPrice })
				.from(inventory)
				.where(eq(inventory.projectId, projectId))
				.limit(1);

			if (!current) return fail(404, { message: 'Baris inventori judul ini tidak ditemukan.' });

			await db
				.update(inventory)
				.set({ retailPrice: String(price), updatedAt: new Date() })
				.where(eq(inventory.id, current.id));

			await audit({
				actor: profile,
				action: 'catalog.price_changed',
				entityType: 'catalog',
				entityId: projectId,
				summary: `Mengubah harga retail menjadi Rp ${price.toLocaleString('id-ID')}.`,
				changes: { retailPrice: { from: current.retailPrice, to: String(price) } }
			});

			return { ok: true, message: `Harga retail diperbarui ke Rp ${price.toLocaleString('id-ID')}.` };
		} catch (e) {
			return toFailure(e);
		}
	}
};
