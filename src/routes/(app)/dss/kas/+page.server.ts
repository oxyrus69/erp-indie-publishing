import { error } from '@sveltejs/kit';
import {
	cashRecommendations,
	concentrationRisk,
	getDecisionSettings,
	receivableFacts
} from '$lib/server/services/dss';
import { sql } from 'drizzle-orm';
import { db } from '$db';
import type { PageServerLoad } from './$types';

const DSS_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;

export type ProjectedPoint = { week: string; label: string; value: number };

/**
 * Kas: siapa ditagih dulu, dan berapa yang realistis masuk.
 *
 * Proyeksi sengaja tidak memakai asumsi "semua invoice akan dibayar". Tiap
 * invoice ditimbang dengan **tingkat koleksi historis pada umur yang sama**:
 * tagihan umur 31–60 hari yang secara historis hanya 70% tertagih masuk sebagai
 * 70% nilainya. Proyeksi yang selalu optimis membuat keputusan menahan
 * produksi tidak pernah diambil.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !DSS_ROLES.includes(role as (typeof DSS_ROLES)[number])) {
		error(403, 'Keputusan kas hanya untuk tim internal penerbitan.');
	}

	const rules = await getDecisionSettings();
	const facts = await receivableFacts();
	const recommendations = cashRecommendations(facts, rules.cash);
	const concentration = concentrationRisk(facts, rules.cash);

	/* Tingkat koleksi historis per bucket umur, dari invoice yang sudah lunas. */
	const paidRows = await db.execute<{ bucket: string; paid: string; total: string }>(sql`
		select
			case
				when age_days <= 30 then 'b0_30'
				when age_days <= 60 then 'b31_60'
				when age_days <= 90 then 'b61_90'
				else 'b90_plus'
			end as bucket,
			count(*) filter (where status = 'PAID')::text as paid,
			count(*)::text as total
		from (
			select status, greatest(current_date - coalesce(due_date, created_at::date), 0) as age_days
			from invoices
			where status <> 'VOID'
		) t
		group by 1
	`);

	const collectionBy = new Map(
		[...paidRows].map((row) => {
			const total = Number(row.total);
			return [row.bucket, total > 0 ? Number(row.paid) / total : 0.85] as const;
		})
	);

	function collectionRate(overdueDays: number): number {
		const bucket =
			overdueDays <= 30 ? 'b0_30' : overdueDays <= 60 ? 'b31_60' : overdueDays <= 90 ? 'b61_90' : 'b90_plus';
		return collectionBy.get(bucket) ?? 0.85;
	}

	/* Proyeksi 8 minggu: invoice masuk di minggu ke-N setelah jatuh tempo. */
	const weeks: ProjectedPoint[] = [];
	for (let i = 0; i < 8; i++) {
		const start = new Date();
		start.setDate(start.getDate() + i * 7);
		const label = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
		weeks.push({ week: `W${i + 1}`, label, value: 0 });
	}

	let weightedTotal = 0;
	for (const fact of facts) {
		if (fact.outstanding <= 0) continue;
		const rate = collectionRate(Math.max(0, fact.overdueDays));
		const expected = fact.outstanding * rate;
		weightedTotal += expected;

		/* Invoice yang sudah lewat tempo dianggap masuk minggu ini (realistis: paling cepat). */
		const weekIndex = fact.overdueDays >= 0 ? 0 : Math.min(7, Math.ceil(-fact.overdueDays / 7));
		const bucket = weeks[weekIndex];
		if (bucket) bucket.value += expected;
	}

	const totalOutstanding = facts.reduce((sum, fact) => sum + fact.outstanding, 0);

	return {
		rules: rules.cash,
		recommendations,
		queue: [...facts]
			.filter((fact) => fact.outstanding > 0)
			.sort((a, b) => b.overdueDays - a.overdueDays || b.outstanding - a.outstanding),
		concentration,
		weeks: weeks.map((week) => ({ ...week, value: Math.round(week.value) })),
		totals: {
			outstanding: Math.round(totalOutstanding),
			weighted: Math.round(weightedTotal),
			overdueAmount: Math.round(
				facts.filter((fact) => fact.overdueDays > 0).reduce((sum, fact) => sum + fact.outstanding, 0)
			),
			overdueCount: facts.filter((fact) => fact.overdueDays > 0).length,
			holdSuggested: totalOutstanding >= rules.cash.holdProductionThreshold
		}
	};
};
