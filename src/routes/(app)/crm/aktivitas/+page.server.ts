import { error } from '@sveltejs/kit';
import { recentActivities, dueTasks } from '$lib/server/services/crm';
import {
	ACTIVITY_KIND_LABEL,
	LEAD_STAGE_LABEL,
	OUTREACH_CHANNEL_LABEL,
	pipelineKpi
} from '$lib/server/services/leads';import type { PageServerLoad } from './$types';

const CRM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

/**
 * Umpan kerja CRM: apa yang baru terjadi dan apa yang harus dikerjakan.
 *
 * Dua daftar, satu layar:
 *  - aktivitas lintas prospek (siapa menghubungi siapa, kapan),
 *  - tugas follow-up yang jatuh tempo atau lewat tenggat.
 *
 * Tidak ada filter tanggal di sini: rentang panjang membuat daftar tidak
 * terbaca. Arsip lengkap ada di laporan dan ekspor CSV.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !CRM_ROLES.includes(role as (typeof CRM_ROLES)[number])) {
		error(403, 'CRM hanya untuk Project Manager dan Super Admin.');
	}

	const [activities, tasks, kpi] = await Promise.all([
		recentActivities(60),
		dueTasks(),
		pipelineKpi()
	]);

	return {
		activities,
		tasks,
		kpi,
		kindLabel: ACTIVITY_KIND_LABEL,
		stageLabel: LEAD_STAGE_LABEL,
		channelLabel: OUTREACH_CHANNEL_LABEL,
		today: new Date().toISOString().slice(0, 10),
		overdueCount: tasks.filter((task) => task.overdue).length,
		todayCount: tasks.filter((task) => task.today).length
	};
};
