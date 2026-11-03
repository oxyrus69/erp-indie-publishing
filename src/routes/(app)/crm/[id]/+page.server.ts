import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '$db';
import { packages, profiles } from '$db/schema';
import { audit } from '$lib/server/services/auditDraft';
import { convertLead } from '$lib/server/services/crm';
import { ErpError } from '$lib/server/services/erpErrors';
import { readRequestId, runIdempotent } from '$lib/server/services/idempotency';
import {
	addActivity,
	addTag,
	deleteActivity,
	deleteLead,
	ACTIVITY_KINDS,
	ACTIVITY_KIND_LABEL,
	getLead,
	LEAD_SOURCES,
	LEAD_SOURCE_LABEL,
	LEAD_STAGE_LABEL,
	listActivities,
	listOutreach,
	listTasks,
	addTask,
	toggleTask,
	deleteTask,
	removeTag,
	setStage,
	updateLead,
	type ActivityKindValue,
	type LeadSourceValue,
	type LeadStageValue
} from '$lib/server/services/leads';
import type { Actions, PageServerLoad } from './$types';

const CRM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

function canUseCrm(role: string | undefined): boolean {
	return Boolean(role && CRM_ROLES.includes(role as (typeof CRM_ROLES)[number]));
}

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	console.error('[crm] aksi detail gagal:', e);
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/** Nominal dari input teks berformat Indonesia (`1.500.000` atau `1,5`). */
function parseMoney(raw: FormDataEntryValue | null): number {
	const text = String(raw ?? '').trim();
	if (!text) return 0;
	/* Buang pemisah ribuan; koma diperlakukan sebagai desimal. */
	const normalized = text.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
	const n = Number.parseFloat(normalized);
	return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!canUseCrm(locals.profile?.role)) {
		error(403, 'CRM hanya untuk Project Manager dan Super Admin.');
	}

	const lead = await getLead(params.id);
	if (!lead) error(404, 'Prospek tidak ditemukan.');

	const [activities, tasks, outreach, owners, templates, pkgs] = await Promise.all([
		listActivities(lead.id),
		listTasks(lead.id),
		listOutreach(lead.id),
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
		db.query.messageTemplates.findMany({ orderBy: (t, { desc: d }) => [d(t.createdAt)] }),
		db
			.select({ id: packages.id, name: packages.name, basePrice: packages.basePrice })
			.from(packages)
			.where(eq(packages.isActive, true))
			.orderBy(asc(packages.name))
	]);

	/* Nama penulis tujuan konversi, bila sudah pernah dikonversi. */
	let authorName: string | null = null;
	if (lead.authorId) {
		const [author] = await db
			.select({ fullName: profiles.fullName })
			.from(profiles)
			.where(eq(profiles.id, lead.authorId))
			.limit(1);
		authorName = author?.fullName ?? null;
	}

	return {
		lead,
		activities,
		tasks,
		outreach,
		owners,
		templates,
		packages: pkgs.map((pkg) => ({ ...pkg, basePriceNum: Number(pkg.basePrice) })),
		authorName,
		sources: LEAD_SOURCES,
		sourceLabel: LEAD_SOURCE_LABEL,
		stageLabel: LEAD_STAGE_LABEL,
		activityKinds: ACTIVITY_KINDS,
		activityKindLabel: ACTIVITY_KIND_LABEL
	};
};

export const actions: Actions = {
	/** Memperbarui data prospek. Tahap TIDAK ikut di sini. */
	update: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah prospek.' });
		}

		const form = await request.formData();
		const ownerIdRaw = String(form.get('ownerId') ?? '').trim();
		const source = String(form.get('source') ?? 'OTHER');

		if (!LEAD_SOURCES.includes(source as LeadSourceValue)) {
			return fail(400, { message: 'Sumber prospek tidak dikenal.' });
		}

		try {
			const { before, after } = await updateLead(params.id, {
				fullName: String(form.get('fullName') ?? '').trim(),
				email: String(form.get('email') ?? '').trim() || null,
				phone: String(form.get('phone') ?? '').trim() || null,
				bookTitle: String(form.get('bookTitle') ?? '').trim() || null,
				genre: String(form.get('genre') ?? '').trim() || null,
				estimatedValue: parseMoney(form.get('estimatedValue')),
				source: source as LeadSourceValue,
				ownerId: ownerIdRaw || null,
				notes: String(form.get('notes') ?? '').trim() || null
			});

			await audit({
				actor: profile,
				action: 'lead.updated',
				entityType: 'lead',
				entityId: params.id,
				summary: `Memperbarui data prospek ${after.fullName}.`,
				changes: {
					estimatedValue: { from: before.estimatedValue, to: after.estimatedValue },
					ownerId: { from: before.ownerId, to: after.ownerId },
					source: { from: before.source, to: after.source }
				}
			});

			return { ok: true, message: 'Data prospek diperbarui.' };
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Mengubah tahap (selain MENANG, yang hanya lewat `convert`). */
	stage: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menggerakkan pipeline.' });
		}

		const form = await request.formData();
		const stageValue = String(form.get('stage') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		const allowed: LeadStageValue[] = ['PROSPEK', 'KONTAK', 'PROPOSAL', 'NEGOSIASI', 'KALAH'];

		if (!allowed.includes(stageValue as LeadStageValue)) {
			return fail(400, { message: 'Tahap tidak dikenal.' });
		}
		if (stageValue === 'KALAH' && reason.length < 5) {
			return fail(400, { message: 'Tandai kalah dengan alasan (minimal 5 karakter).' });
		}

		try {
			const before = await getLead(params.id);
			if (!before) return fail(404, { message: 'Prospek tidak ditemukan.' });
			if (stageValue === 'NEGOSIASI' && before.estimatedValue <= 0) {
				return fail(400, { message: 'Isi estimasi nilai kontrak sebelum masuk Negosiasi.' });
			}

			const { fromStage } = await setStage(
				params.id,
				stageValue as 'PROSPEK' | 'KONTAK' | 'PROPOSAL' | 'NEGOSIASI' | 'KALAH',
				stageValue === 'KALAH' ? reason : null
			);

			await audit({
				actor: profile,
				action: stageValue === 'KALAH' ? 'lead.lost' : 'lead.stage_changed',
				entityType: 'lead',
				entityId: params.id,
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
						? 'Prospek ditandai kalah.'
						: `Tahap kini ${LEAD_STAGE_LABEL[stageValue as LeadStageValue]}.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/**
	 * Konversi menang: prospek menjadi akun penulis.
	 *
	 * Akun dibuat lewat `createAccount` (auth.users + profil), atau disambungkan
	 * ke akun penulis yang sudah ada bila emailnya cocok. Setelah itu pengguna
	 * diarahkan ke /orders dengan penulis terpilih — order adalah kontraknya.
	 */
	convert: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengonversi prospek.' });
		}

		const form = await request.formData();
		const requestId = readRequestId(form);
		const bookTitle = String(form.get('bookTitle') ?? '').trim();
		const packageId = String(form.get('packageId') ?? '');

		try {
			const { value: result, replayed } = await runIdempotent({
				scope: 'lead.convert',
				actorId: profile.id,
				requestId,
				work: () => convertLead(params.id, { id: profile.id, fullName: profile.fullName }),
				serialize: (value) => ({ ...value }),
				deserialize: (row) => ({
					leadId: String(row.leadId),
					authorId: String(row.authorId),
					authorName: String(row.authorName),
					createdAccount: Boolean(row.createdAccount)
				})
			});

			if (!replayed) {
				await audit({
					actor: profile,
					action: 'lead.won',
					entityType: 'lead',
					entityId: params.id,
					summary: result.createdAccount
						? `Mengonversi prospek menjadi penulis baru: ${result.authorName}.`
						: `Mengonversi prospek ke akun penulis yang sudah ada: ${result.authorName}.`,
					context: { authorId: result.authorId, createdAccount: result.createdAccount },
					requestId
				});
			}

			/*
			 * Order adalah tempat transaksi berlanjut. Bila judul sudah ada di
			 * form konversi, bawa sebagai prefill supaya staf tidak mengetik dua
			 * kali; id paket ikut bila dipilih.
			 */
			const qs = new URLSearchParams({ authorId: result.authorId });
			if (bookTitle) qs.set('bookTitle', bookTitle);
			if (packageId) qs.set('packageId', packageId);

			return {
				ok: true,
				message: result.createdAccount
					? `${result.authorName} kini punya akun penulis. Lanjutkan ke order.`
					: `Prospek tersambung ke akun penulis ${result.authorName}.`,
				redirectTo: `/orders?${qs.toString()}`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	activity: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mencatat aktivitas.' });
		}

		const form = await request.formData();
		const kind = String(form.get('kind') ?? 'NOTE');
		const note = String(form.get('note') ?? '').trim();

		if (!ACTIVITY_KINDS.includes(kind as ActivityKindValue)) {
			return fail(400, { message: 'Jenis aktivitas tidak dikenal.' });
		}
		if (kind !== 'NOTE' && note.length < 3) {
			return fail(400, { message: 'Tuliskan ringkasan percakapan (minimal 3 karakter).' });
		}

		try {
			const { activityId } = await addActivity({
				leadId: params.id,
				kind: kind as ActivityKindValue,
				note,
				actorId: profile.id
			});

			await audit({
				actor: profile,
				action: 'lead.activity_added',
				entityType: 'lead',
				entityId: params.id,
				summary: `Mencatat ${ACTIVITY_KIND_LABEL[kind as ActivityKindValue]}: ${note || 'tanpa catatan'}.`,
				context: { activityId, kind }
			});

			return { ok: true, message: 'Aktivitas tercatat.' };
		} catch (e) {
			return toFailure(e);
		}
	},

	deleteActivity: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menghapus aktivitas.' });
		}

		const form = await request.formData();
		const activityId = String(form.get('activityId') ?? '');
		if (!activityId) return fail(400, { message: 'Aktivitas tidak dipilih.' });

		try {
			await deleteActivity(activityId);
			return { ok: true, message: 'Aktivitas dihapus.' };
		} catch (e) {
			return toFailure(e);
		}
	},

	addTask: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat membuat tugas.' });
		}

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const dueDate = String(form.get('dueDate') ?? '').trim();

		if (title.length < 3) return fail(400, { message: 'Judul tugas minimal 3 karakter.' });

		try {
			await addTask({ leadId: params.id, title, dueDate: dueDate || null });
			return { ok: true, message: 'Tugas follow-up dibuat.' };
		} catch (e) {
			return toFailure(e);
		}
	},

	toggleTask: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah tugas.' });
		}

		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		if (!taskId) return fail(400, { message: 'Tugas tidak dipilih.' });

		try {
			const { done } = await toggleTask(taskId);
			return { ok: true, message: done ? 'Tugas ditandai selesai.' : 'Tugas dibuka kembali.' };
		} catch (e) {
			return toFailure(e);
		}
	},

	deleteTask: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menghapus tugas.' });
		}

		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		if (!taskId) return fail(400, { message: 'Tugas tidak dipilih.' });

		try {
			await deleteTask(taskId);
			return { ok: true, message: 'Tugas dihapus.' };
		} catch (e) {
			return toFailure(e);
		}
	},

	addTag: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menambah tag.' });
		}

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Tag tidak boleh kosong.' });

		try {
			const { tagName } = await addTag(params.id, name);
			return { ok: true, message: `Tag “${tagName}” ditambahkan.` };
		} catch (e) {
			return toFailure(e);
		}
	},

	removeTag: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menghapus tag.' });
		}

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Tag tidak dipilih.' });

		try {
			await removeTag(params.id, name);
			return { ok: true, message: `Tag “${name}” dihapus.` };
		} catch (e) {
			return toFailure(e);
		}
	},

	/**
	 * Menghapus prospek dari halaman detailnya.
	 *
	 * Hanya untuk baris yang salah catat: prospek yang sudah dikonversi menjadi
	 * penulis ditolak oleh service, karena identitasnya sudah dipakai order.
	 */
	delete: async ({ request, locals, params }) => {
		const profile = locals.profile;
		if (!profile || !canUseCrm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menghapus prospek.' });
		}

		const form = await request.formData();
		const reason = String(form.get('reason') ?? '').trim();
		if (reason.length < 5) {
			return fail(400, { message: 'Alasan penghapusan wajib (minimal 5 karakter).' });
		}

		try {
			const { fullName } = await deleteLead(params.id);
			await audit({
				actor: profile,
				action: 'lead.deleted',
				entityType: 'lead',
				entityId: params.id,
				summary: `Menghapus prospek ${fullName}. ${reason}`,
				context: { reason }
			});
			return { ok: true, message: `${fullName} dihapus dari pipeline.` };
		} catch (e) {
			return toFailure(e);
		}
	}
};
