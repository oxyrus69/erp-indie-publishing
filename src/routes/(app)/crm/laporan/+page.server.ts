import { error } from '@sveltejs/kit';
import {
	activityByStaff,
	bySource,
	monthlyProspects,
	outreachStats,
	pipelineFunnel
} from '$lib/server/services/crm';
import {
	LEAD_SOURCE_LABEL,
	LEAD_STAGE_LABEL,
	OUTREACH_CHANNEL_LABEL,
	pipelineKpi
} from '$lib/server/services/leads';
import type { PageServerLoad } from './$types';

const CRM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

/**
 * Laporan CRM.
 *
 * Semua angka dihitung dari baris nyata saat halaman dibuka. Tidak ada kolom
 * cache: laporan yang bisa basi lebih berbahaya daripada laporan yang lambat,
 * dan pada skala penerbitan ini (ratusan prospek) selisihnya tidak terasa.
 *
 * Win rate dihitung dari prospek yang sudah SELESAI (menang + kalah). Prospek
 * yang masih berjalan tidak masuk penyebut — memasukkannya membuat win rate
 * selalu terlihat buruk hanya karena pipeline sedang penuh.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !CRM_ROLES.includes(role as (typeof CRM_ROLES)[number])) {
		error(403, 'Laporan CRM hanya untuk Project Manager dan Super Admin.');
	}

	const [funnel, sources, monthly, staff, outreach, kpi] = await Promise.all([
		pipelineFunnel(),
		bySource(),
		monthlyProspects(12),
		activityByStaff(30),
		outreachStats(30),
		pipelineKpi()
	]);

	const totalClosed = sources.reduce((sum, row) => sum + row.win, 0) + kpi.lostMonth;
	const wonTotal = sources.reduce((sum, row) => sum + row.win, 0);
	const winRate = totalClosed > 0 ? Math.round((wonTotal / totalClosed) * 100) : null;

	const bestSource = [...sources].sort((a, b) => b.win - a.win || b.value - a.value)[0] ?? null;

	return {
		funnel,
		sources,
		monthly,
		staff,
		outreach,
		kpi,
		winRate,
		wonTotal,
		closedTotal: totalClosed,
		bestSource,
		stageLabel: LEAD_STAGE_LABEL,
		sourceLabel: LEAD_SOURCE_LABEL,
		channelLabel: OUTREACH_CHANNEL_LABEL
	};
};
