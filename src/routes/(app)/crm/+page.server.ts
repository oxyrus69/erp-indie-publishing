import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '$db';
import { packages, profiles } from '$db/schema';
import { audit } from '$lib/server/services/auditDraft';
import { seedTemplates } from '$lib/server/services/crm';
import { ErpError } from '$lib/server/services/erpErrors';
import { readRequestId, runIdempotent } from '$lib/server/services/idempotency';
import {
	createLead,
	deleteLead,
	LEAD_SOURCES,
	LEAD_SOURCE_LABEL,
	LEAD_STAGE_LABEL,
	listLeads,
	pipelineKpi,
	setStage,
	getLead,
	type LeadSourceValue,
	type LeadStageValue
} from '$lib/server/services/leads';
import { toMoneyString } from '$lib/server/services/money';
import { formatIDR } from '$lib/ui';
import type { Actions, PageServerLoad } from './$types';

const CRM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

type CrmRole = (typeof CRM_ROLES)[number];

function canUseCrm(role: string | undefined): boolean {
	return Boolean(role && CRM_ROLES.includes(role as CrmRole));
}

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	console.error('[crm] aksi gagal:', e);
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Papan pipeline CRM.
 *
 * Seluruh prospek aktif dimuat sekaligus: papan harus memperlihatkan isi pipa
 * tanpa pagination. Daftar ini tumbuh lambat (satu baris = satu naskah), jadi
 * batas halaman justru menyembunyikan pekerjaan yang perlu ditindak.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!canUseCrm(role)) {
		error(403, 'CRM hanya untuk Project Manager dan Super Admin.');
	}

	const view = url.searchParams.get('view') === 'list' ? 'list' : 'board';
	const q = (url.searchParams.get('q') ?? '').trim();
	const source = url.searchParams.get('source') ?? '';
	const stageParam = url.searchParams.get('stage') ?? '';
	const owner = url.searchParams.get('owner') ?? '';

	const safeSource = LEAD_SOURCES.includes(source as LeadSourceValue) ? source : '';
	const safeStage = Object.keys(LEAD_STAGE_LABEL).includes(stageParam) ? stageParam : '';

	const [rows, kpi, owners, pkgs] = await Promise.all([
		listLeads({
			q,
			stage: safeStage || undefined,
			source: safeSource || undefined,
			ownerId: owner || undefined
		}),
		pipelineKpi(),
		db
			.select({ id: profiles.id, fullName: profiles.fullName })
			.from(profiles)
			.where(
				and(
					eq(profiles.isActive, true),
					inArray(profiles.role, ['SUPER_ADMIN', 'PROJECT_MANAGER'])
				)
			)
			.orderBy(asc(profiles.fullName)),
		db
			.select({ id: packages.id, name: packages.name, basePrice: packages.basePrice })
			.from(packages)
			.where(eq(packages.isActive, true))
			.orderBy(asc(packages.name))
	]);

	/* Template pesan disiapkan di sini supaya halaman detail langsung siap pakai. */
	await seedTemplates().catch((e) => console.error('[crm] seed template gagal:', e));

	return {
		rows,
		kpi,
		owners,
		packages: pkgs,
		sources: LEAD_SOURCES,
		sourceLabel: LEAD_SOURCE_LABEL,
		stageLabel: LEAD_STAGE_LABEL,
		activeStages: ['PROSPEK', 'KONTAK', 'PROPOSAL', 'NEGOSIASI'] as LeadStageValue[],
		selfId: locals.profile?.id ?? null,
		view,
		filter: { q, source: safeSource, stage: safeStage, owner }
	};
};

export const actions: Actions = {
	/** Mencatat prospek baru. Idempoten per (aktor, requestId). */
	create: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menambah prospek.' });
		}

		const form = await request.formData();
		const requestId = readRequestId(form);

		const fullName = String(form.get('fullName') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const phone = String(form.get('phone') ?? '').trim();
		const bookTitle = String(form.get('bookTitle') ?? '').trim();
		const genre = String(form.get('genre') ?? '').trim();
		const estimatedValue = Number(String(form.get('estimatedValue') ?? '').replace(/[^\d]/g, '')) || 0;
		const source = String(form.get('source') ?? 'OTHER');
		const ownerIdRaw = String(form.get('ownerId') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();

		if (fullName.length < 3) return fail(400, { message: 'Nama prospek minimal 3 karakter.' });
		if (!email && !phone) return fail(400, { message: 'Isi email atau telepon prospek.' });
		if (!LEAD_SOURCES.includes(source as LeadSourceValue)) {
			return fail(400, { message: 'Sumber prospek tidak dikenal.' });
		}

		/* Pemilik default = pencatat; hanya staf aktif yang boleh dipilih. */
		let ownerId = profile.id;
		if (ownerIdRaw) {
			const [candidate] = await db
				.select({ id: profiles.id })
				.from(profiles)
				.where(and(eq(profiles.id, ownerIdRaw), eq(profiles.isActive, true)))
				.limit(1);
			if (!candidate) return fail(400, { message: 'Pemilik prospek tidak valid.' });
			ownerId = candidate.id;
		}

		try {
			const { value: leadId, replayed } = await runIdempotent({
				scope: 'lead.create',
				actorId: profile.id,
				requestId,
				work: async () => {
					const created = await createLead({
						fullName,
						email,
						phone,
						bookTitle,
						genre,
						estimatedValue,
						source: source as LeadSourceValue,
						ownerId,
						notes
					});
					return created.leadId;
				},
				serialize: (value) => ({ leadId: value }),
				deserialize: (row) => String(row.leadId)
			});

			if (!replayed) {
				await audit({
					actor: profile,
					action: 'lead.created',
					entityType: 'lead',
					entityId: leadId,
					summary: `Menambah prospek ${fullName}${bookTitle ? ` untuk “${bookTitle}”` : ''}.`,
					context: { source, estimatedValue: toMoneyString(estimatedValue) },
					requestId
				});
			}

			return {
				ok: true,
				leadId,
				replayed,
				message: replayed
					? `${fullName} sudah tercatat di pipeline.`
					: `${fullName} masuk pipeline.${estimatedValue > 0 ? ` Estimasi ${formatIDR(estimatedValue)}.` : ''}`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/**
	 * Mengubah tahap pipeline.
	 *
	 * MENANG tidak lewat sini: konversi penulis hanya terjadi di halaman detail
	 * (lihat `convert`). KALAH wajib disertai alasan.
	 */
	stage: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menggerakkan pipeline.' });
		}

		const form = await request.formData();
		const leadId = String(form.get('leadId') ?? '');
		const stageValue = String(form.get('stage') ?? '');
		const reason = String(form.get('reason') ?? '').trim();

		if (!leadId) return fail(400, { message: 'Prospek tidak dipilih.' });
		const allowed: LeadStageValue[] = ['PROSPEK', 'KONTAK', 'PROPOSAL', 'NEGOSIASI', 'KALAH'];
		if (!allowed.includes(stageValue as LeadStageValue)) {
			return fail(400, { message: 'Tahap tidak dikenal.' });
		}
		if (stageValue === 'KALAH' && reason.length < 5) {
			return fail(400, { message: 'Tandai kalah dengan alasan (minimal 5 karakter).' });
		}

		try {
			const before = await getLead(leadId);
			if (!before) return fail(404, { message: 'Prospek tidak ditemukan.' });

			/*
			 * Negosiasi tanpa nilai = pipeline yang tidak bisa dilaporkan.
			 * Nilai diminta sebelum tahap bergerak, bukan sesudah.
			 */
			if (stageValue === 'NEGOSIASI' && before.estimatedValue <= 0) {
				return fail(400, {
					message: 'Isi dulu estimasi nilai kontrak sebelum masuk Negosiasi.'
				});
			}

			const { fromStage } = await setStage(
				leadId,
				stageValue as 'PROSPEK' | 'KONTAK' | 'PROPOSAL' | 'NEGOSIASI' | 'KALAH',
				stageValue === 'KALAH' ? reason : null
			);

			await audit({
				actor: profile,
				action: stageValue === 'KALAH' ? 'lead.lost' : 'lead.stage_changed',
				entityType: 'lead',
				entityId: leadId,
				summary:
					stageValue === 'KALAH'
						? `Menandai ${before.fullName} kalah: ${reason}`
						: `Memindahkan ${before.fullName} dari ${LEAD_STAGE_LABEL[fromStage]} ke ${
								LEAD_STAGE_LABEL[stageValue as LeadStageValue]
							}.`,
				changes: { stage: { from: fromStage, to: stageValue } },
				context: stageValue === 'KALAH' ? { reason } : null
			});

			return {
				ok: true,
				message:
					stageValue === 'KALAH'
						? `Ditandai kalah. ${before.fullName} keluar dari pipeline aktif.`
						: `${before.fullName} kini di tahap ${LEAD_STAGE_LABEL[stageValue as LeadStageValue]}.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Menghapus prospek yang belum dikonversi (belum menjadi akun penulis). */
	delete: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menghapus prospek.' });
		}

		const form = await request.formData();
		const leadId = String(form.get('leadId') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (!leadId) return fail(400, { message: 'Prospek tidak dipilih.' });
		if (reason.length < 5) {
			return fail(400, { message: 'Alasan penghapusan wajib (minimal 5 karakter).' });
		}

		try {
			const { fullName } = await deleteLead(leadId);
			await audit({
				actor: profile,
				action: 'lead.deleted',
				entityType: 'lead',
				entityId: leadId,
				summary: `Menghapus prospek ${fullName}. ${reason}`,
				context: { reason }
			});
			return { ok: true, message: `${fullName} dihapus dari pipeline.` };
		} catch (e) {
			return toFailure(e);
		}
	}
};
