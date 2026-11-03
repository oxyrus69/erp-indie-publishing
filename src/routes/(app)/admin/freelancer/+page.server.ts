import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import { freelancerLedgers, productionTasks, profiles } from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import { audit } from '$lib/server/services/auditDraft';
import { createAccount } from '$lib/server/services/accounts';
import { ErpError } from '$lib/server/services/erpErrors';
import { SPECIALTY_LABEL } from '$lib/ui';
import type { Actions, PageServerLoad } from './$types';

const PM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;
const SPECIALTIES = ['EDITOR', 'PROOFREADER', 'LAYOUTER', 'COVER_DESIGNER'] as const;

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Direktori freelancer.
 *
 * Sebelum ini tidak ada cara menambah freelancer sama sekali: `profiles`
 * hanya terisi lewat seed. Padahal freelancer adalah pihak pertama yang
 * menerima tugas — tanpa mereka, pipeline produksi tidak bisa berjalan.
 *
 * Akun dibuat langsung aktif dan tanpa kata sandi login (dev auth maupun
 * Supabase Auth), karena freelancer masuk lewat undangan terpisah. Yang
 * penting di sini adalah baris profil yang bisa ditugaskan.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
		error(403, 'Direktori freelancer hanya untuk Project Manager.');
	}

	const q = (url.searchParams.get('q') ?? '').trim();
	const specialty = url.searchParams.get('specialty') ?? '';

	const conditions: SQL[] = [eq(profiles.role, 'FREELANCER')];
	if (q) {
		const pattern = `%${q}%`;
		const search = or(ilike(profiles.fullName, pattern), ilike(profiles.email, pattern));
		if (search) conditions.push(search);
	}
	if (SPECIALTIES.includes(specialty as (typeof SPECIALTIES)[number])) {
		conditions.push(eq(profiles.specialty, specialty as never));
	}

	const rows = await db
		.select({
			id: profiles.id,
			fullName: profiles.fullName,
			email: profiles.email,
			phone: profiles.phone,
			specialty: profiles.specialty,
			isActive: profiles.isActive,
			createdAt: profiles.createdAt
		})
		.from(profiles)
		.where(and(...conditions))
		.orderBy(asc(profiles.fullName));

	const ids = rows.map((row) => row.id);

	/* Beban kerja & saldo per freelancer, diambil sekali untuk semua baris. */
	const [taskRows, ledgerRows] = await Promise.all([
		ids.length
			? db
					.select({
						assigneeId: productionTasks.assigneeId,
						open: sql<number>`count(*) filter (where ${productionTasks.status} in ('PENDING', 'IN_PROGRESS'))::int`,
						review: sql<number>`count(*) filter (where ${productionTasks.status} = 'WAITING_AUTHOR_REVIEW')::int`,
						done: sql<number>`count(*) filter (where ${productionTasks.status} = 'COMPLETED')::int`
					})
					.from(productionTasks)
					.where(inArray(productionTasks.assigneeId, ids))
					.groupBy(productionTasks.assigneeId)
			: [],
		ids.length
			? db
					.select({
						freelancerId: freelancerLedgers.freelancerId,
						available: sql<string>`coalesce(sum(case when ${freelancerLedgers.status} = 'AVAILABLE' then ${freelancerLedgers.amount} else 0 end), 0)`,
						pending: sql<string>`coalesce(sum(case when ${freelancerLedgers.status} = 'PENDING' then ${freelancerLedgers.amount} else 0 end), 0)`
					})
					.from(freelancerLedgers)
					.where(inArray(freelancerLedgers.freelancerId, ids))
					.groupBy(freelancerLedgers.freelancerId)
			: []
	]);

	const taskBy = new Map(taskRows.map((row) => [row.assigneeId, row]));
	const ledgerBy = new Map(ledgerRows.map((row) => [row.freelancerId, row]));

	return {
		freelancers: rows.map((row) => {
			const tasks = taskBy.get(row.id);
			const ledger = ledgerBy.get(row.id);
			return {
				...row,
				openTasks: tasks?.open ?? 0,
				reviewTasks: tasks?.review ?? 0,
				doneTasks: tasks?.done ?? 0,
				availableNum: toNumber(ledger?.available ?? 0),
				pendingNum: toNumber(ledger?.pending ?? 0)
			};
		}),
		specialties: SPECIALTIES.map((key) => ({ value: key, label: SPECIALTY_LABEL[key] ?? key })),
		filter: { q, specialty }
	};
};

export const actions: Actions = {
	/** Menambah freelancer baru ke direktori. */
	create: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menambah freelancer.' });
		}

		const form = await request.formData();
		const fullName = String(form.get('fullName') ?? '').trim();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const phone = String(form.get('phone') ?? '').trim() || null;
		const specialty = String(form.get('specialty') ?? '');

		if (fullName.length < 3) return fail(400, { message: 'Nama lengkap minimal 3 karakter.' });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return fail(400, { message: 'Alamat email tidak valid.' });
		}
		if (!SPECIALTIES.includes(specialty as (typeof SPECIALTIES)[number])) {
			return fail(400, { message: 'Pilih keahlian freelancer.' });
		}

		try {
			const created = await createAccount({
				email,
				fullName,
				role: 'FREELANCER',
				phone,
				specialty
			});

			await audit({
				actor: profile,
				action: 'freelancer.created',
				entityType: 'user',
				entityId: created.id,
				summary: `Menambahkan freelancer ${fullName} (${SPECIALTY_LABEL[specialty] ?? specialty}).`,
				context: { email, specialty, phone }
			});

			return { ok: true, message: `${fullName} ditambahkan dan siap ditugaskan.` };
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Mengubah data freelancer atau mengaktifkan/menonaktifkannya. */
	update: async ({ request, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah freelancer.' });
		}

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const fullName = String(form.get('fullName') ?? '').trim();
		const phone = String(form.get('phone') ?? '').trim() || null;
		const specialty = String(form.get('specialty') ?? '');
		const isActive = form.get('isActive') === 'on';

		if (!id) return fail(400, { message: 'Freelancer tidak dipilih.' });
		if (fullName.length < 3) return fail(400, { message: 'Nama lengkap minimal 3 karakter.' });
		if (!SPECIALTIES.includes(specialty as (typeof SPECIALTIES)[number])) {
			return fail(400, { message: 'Pilih keahlian freelancer.' });
		}

		try {
			const [before] = await db
				.select({
					role: profiles.role,
					isActive: profiles.isActive,
					specialty: profiles.specialty
				})
				.from(profiles)
				.where(eq(profiles.id, id))
				.limit(1);

			if (!before) return fail(404, { message: 'Freelancer tidak ditemukan.' });
			if (before.role !== 'FREELANCER') {
				return fail(400, { message: 'Akun ini bukan freelancer.' });
			}

			/*
			 * Menonaktifkan freelancer yang masih punya task terbuka akan membuat
			 * pekerjaan itu tak bisa diselesaikan siapa pun. Ditolak, bukan
			 * dibiarkan: lebih baik menyelesaikan atau memindahkan tugas dulu.
			 */
			if (before.isActive && !isActive) {
				const [busy] = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(productionTasks)
					.where(
						and(
							eq(productionTasks.assigneeId, id),
							inArray(productionTasks.status, ['PENDING', 'IN_PROGRESS', 'WAITING_AUTHOR_REVIEW'])
						)
					);
				if ((busy?.count ?? 0) > 0) {
					return fail(422, {
						message: `${busy!.count} task masih dikerjakan freelancer ini. Selesaikan atau pindahkan tugasnya dulu.`
					});
				}
			}

			await db
				.update(profiles)
				.set({ fullName, phone, specialty: specialty as never, isActive, updatedAt: new Date() })
				.where(eq(profiles.id, id));

			await audit({
				actor: profile,
				action: 'freelancer.created',
				entityType: 'user',
				entityId: id,
				summary: `Memperbarui freelance ${fullName}${before.isActive !== isActive ? (isActive ? ' — diaktifkan' : ' — dinonaktifkan') : ''}.`,
				changes: {
					specialty: { from: before.specialty, to: specialty },
					isActive: { from: before.isActive, to: isActive }
				}
			});

			return { ok: true, message: `${fullName} diperbarui.` };
		} catch (e) {
			return toFailure(e);
		}
	}
};
