import { error } from '@sveltejs/kit';
import {
	deadlineRisks,
	freelancerLoads,
	getDecisionSettings,
	productionRecommendations,
	staleTasks,
	trackLoads
} from '$lib/server/services/dss';
import type { PageServerLoad } from './$types';

const DSS_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;

const TRACK_LABEL: Record<string, string> = {
	EDITORIAL: 'Editorial',
	LAYOUT: 'Tata Letak',
	COVER: 'Cover',
	LEGAL: 'Legal & ISBN',
	PRINT: 'Cetak'
};

/**
 * Produksi: di mana pekerjaan menumpuk, dan apa yang akan telat.
 *
 * Dua hal yang membuat halaman ini berguna: umur task tertua per track (bukan
 * rata-rata, karena satu task yang nyangkut tiga minggu menahan seluruh track),
 * dan beban per freelancer (supaya "tambah orang" jadi keputusan yang bisa
 * dibuktikan, bukan keluhan).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !DSS_ROLES.includes(role as (typeof DSS_ROLES)[number])) {
		error(403, 'Keputusan produksi hanya untuk tim internal penerbitan.');
	}

	const rules = await getDecisionSettings();
	const [tracks, stale, loads, deadlines] = await Promise.all([
		trackLoads(),
		staleTasks(rules.production),
		freelancerLoads(rules.production),
		deadlineRisks(rules.production)
	]);

	const recommendations = productionRecommendations({
		stale,
		deadlines,
		loads,
		tracks,
		rules: rules.production
	});

	const maxTrackOpen = Math.max(1, ...tracks.map((track) => track.open));

	return {
		rules: rules.production,
		tracks: tracks
			.map((track) => ({ ...track, label: TRACK_LABEL[track.track] ?? track.track }))
			.sort((a, b) => b.open - a.open),
		stale,
		loads: loads.map((row) => ({
			...row,
			overloaded: row.openTasks > rules.production.maxOpenTasks
		})),
		deadlines,
		recommendations,
		maxTrackOpen,
		totals: {
			open: tracks.reduce((sum, track) => sum + track.open, 0),
			review: tracks.reduce((sum, track) => sum + track.review, 0),
			overloaded: loads.filter((row) => row.openTasks > rules.production.maxOpenTasks).length,
			lateProjects: deadlines.filter((row) => row.daysLeft < 0).length
		}
	};
};
