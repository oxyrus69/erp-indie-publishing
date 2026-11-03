import { error, fail } from '@sveltejs/kit';
import { audit } from '$lib/server/services/auditDraft';
import { ErpError } from '$lib/server/services/erpErrors';
import { allRecommendations, decisionHistory, decisionSummary, recordDecision } from '$lib/server/services/dss';
import type { Actions, PageServerLoad } from './$types';

const DSS_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;

function canUseDss(role: string | undefined): boolean {
	return Boolean(role && DSS_ROLES.includes(role as (typeof DSS_ROLES)[number]));
}

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	console.error('[dss] aksi gagal:', e);
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Pusat keputusan.
 *
 * Halaman ini tidak menampilkan seluruh rekomendasi selamanya: yang sudah
 * diputuskan dalam 14 hari terakhir disembunyikan, dan riwayatnya tetap bisa
 * dibuka. Tanpa itu daftar akan berisi hal yang sama setiap pagi dan berhenti
 * dibaca.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canUseDss(locals.profile?.role)) {
		error(403, 'Pusat keputusan hanya untuk tim internal penerbitan.');
	}

	const domainFilter = url.searchParams.get('domain') ?? '';
	const allowed = ['title', 'cash', 'production'] as const;
	const domain = allowed.includes(domainFilter as (typeof allowed)[number]) ? domainFilter : '';

	const [{ items, rules, decided }, history, summary] = await Promise.all([
		allRecommendations(),
		decisionHistory(25),
		decisionSummary()
	]);

	/* Rekomendasi yang sudah diputuskan belakangan tidak ditampilkan lagi. */
	const visible = items
		.filter((item) => !decided.has(item.key))
		.filter((item) => !domain || item.domain === domain);

	const openImpact = visible.reduce((sum, item) => sum + item.impact, 0);

	return {
		items: visible,
		totalItems: visible.length,
		rules,
		history,
		domain,
		summary: { ...summary, open: visible.length, openImpact },
		countByDomain: {
			title: visible.filter((item) => item.domain === 'title').length,
			cash: visible.filter((item) => item.domain === 'cash').length,
			production: visible.filter((item) => item.domain === 'production').length
		}
	};
};

export const actions: Actions = {
	/** Mencatat keputusan: dikerjakan atau ditolak (wajib alasan singkat). */
	decide: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !canUseDss(profile.role)) {
			return fail(403, { message: 'Hanya tim internal yang dapat mencatat keputusan.' });
		}

		const form = await request.formData();
		const verdictRaw = String(form.get('verdict') ?? '');
		const note = String(form.get('note') ?? '').trim();
		const key = String(form.get('key') ?? '').trim();
		const title = String(form.get('title') ?? '').trim();
		const domain = String(form.get('domain') ?? '').trim();
		const entityType = String(form.get('entityType') ?? '').trim() || null;
		const entityId = String(form.get('entityId') ?? '').trim() || null;

		if (!key || !title) return fail(400, { message: 'Rekomendasi tidak dikenali. Muat ulang halaman.' });
		if (verdictRaw !== 'ACCEPTED' && verdictRaw !== 'DISMISSED') {
			return fail(400, { message: 'Keputusan tidak dikenal.' });
		}
		if (verdictRaw === 'DISMISSED' && note.length < 5) {
			return fail(400, { message: 'Tulis alasan singkat (minimal 5 karakter) sebelum menolak.' });
		}

		/*
		 * Fakta pemicu diambil dari form (dikirim sebagai JSON oleh kartu), bukan
		 * dihitung ulang di sini: rekomendasi bisa berubah antara render dan
		 * klik, dan jejak harus mencerminkan angka yang dilihat pemutusnya.
		 */
		let facts: Record<string, unknown> = {};
		const rawFacts = String(form.get('facts') ?? '');
		if (rawFacts) {
			try {
				const parsed = JSON.parse(rawFacts) as unknown;
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					facts = parsed as Record<string, unknown>;
				}
			} catch {
				/* Fakta rusak tidak boleh menggagalkan keputusan. */
				facts = {};
			}
		}

		try {
			await recordDecision({
				recommendation: {
					key,
					domain: (domain || 'title') as 'title' | 'cash' | 'production' | 'price',
					kind: String(form.get('kind') ?? ''),
					title,
					entity: { type: entityType ?? 'unknown', id: entityId, label: title },
					reason: String(form.get('reason') ?? ''),
					facts,
					impact: Number(String(form.get('impact') ?? '0')) || 0,
					impactLabel: '',
					urgency: 1,
					action: null
				},
				verdict: verdictRaw,
				note,
				actorId: profile.id
			});

			await audit({
				actor: profile,
				action: verdictRaw === 'ACCEPTED' ? 'decision.accepted' : 'decision.dismissed',
				entityType: 'decision',
				entityId,
				summary:
					verdictRaw === 'ACCEPTED'
						? `Mengerjakan rekomendasi: ${title}.`
						: `Menolak rekomendasi: ${title} — ${note}`,
				context: { key, domain, note: note || null }
			});

			return {
				ok: true,
				message:
					verdictRaw === 'ACCEPTED'
						? 'Keputusan dicatat. Rekomendasi disembunyikan 14 hari.'
						: 'Penolakan dicatat beserta alasannya.'
			};
		} catch (e) {
			return toFailure(e);
		}
	}
};
