import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	freelancerLedgers,
	productionTasks,
	revisions,
	withdrawalRequests
} from '$db/schema';
import { getWalletSummary, requestWithdrawal, submitTaskForReview } from '$lib/server/services/erpEngine';
import { audit } from '$lib/server/services/auditDraft';
import { addComment, commentsByTask } from '$lib/server/services/comments';
import { notifyComment } from '$lib/server/services/notifications';
import { getWithdrawalSettings } from '$lib/server/services/settings';
import { readRequestId, runIdempotent } from '$lib/server/services/idempotency';
import { ErpError } from '$lib/server/services/erpErrors';
import { toNumber, toMoneyString } from '$lib/server/services/money';
import type { Actions, PageServerLoad } from './$types';

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/** Selisih hari terhadap hari ini; negatif berarti sudah lewat tenggat. */
function daysUntil(date: string | Date | null): number | null {
	if (!date) return null;
	const target = typeof date === 'string' ? new Date(date) : date;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const d = new Date(target);
	d.setHours(0, 0, 0, 0);
	return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Fee yang akan dibayarkan bila task disetujui.
 * `payoutAmount` baru terisi saat approval, jadi untuk task terbuka nilainya
 * dihitung dari struktur fee — rumusnya sama dengan `computePayout` di engine.
 */
function estimatedFee(task: {
	feeStructure: 'FLAT_FEE' | 'PER_PAGE_RATE';
	flatFee: string;
	perPageRate: string;
	pageCount: number;
}): number {
	return task.feeStructure === 'PER_PAGE_RATE'
		? toNumber(task.perPageRate) * Math.max(0, task.pageCount)
		: toNumber(task.flatFee);
}

/**
 * Ruang kerja freelancer.
 * Hanya task yang ditugaskan ke pengguna ini yang dimuat — tidak ada data
 * freelancer lain, dan tidak ada rute admin yang bisa diakses dari sini.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.profile;
	if (!profile) error(401, 'Silakan masuk terlebih dahulu.');
	if (profile.role !== 'FREELANCER') {
		error(403, 'Halaman ini khusus untuk freelancer.');
	}

	const [taskRows, ledgerRows, withdrawalRows, wallet] = await Promise.all([
		db
			.select({
				id: productionTasks.id,
				track: productionTasks.track,
				stage: productionTasks.stage,
				title: productionTasks.title,
				description: productionTasks.description,
				status: productionTasks.status,
				feeStructure: productionTasks.feeStructure,
				flatFee: productionTasks.flatFee,
				perPageRate: productionTasks.perPageRate,
				pageCount: productionTasks.pageCount,
				payoutAmount: productionTasks.payoutAmount,
				isCommissionCredited: productionTasks.isCommissionCredited,
				revisionCount: productionTasks.revisionCount,
				maxRevisions: productionTasks.maxRevisions,
				isUnlocked: productionTasks.isUnlocked,
				deadline: productionTasks.deadline,
				submittedAt: productionTasks.submittedAt,
				approvedAt: productionTasks.approvedAt,
				projectId: bookProjects.id,
				projectTitle: bookProjects.title,
				authorName: bookProjects.authorName,
				projectStatus: bookProjects.status
			})
			.from(productionTasks)
			.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
			.where(eq(productionTasks.assigneeId, profile.id))
			.orderBy(asc(productionTasks.deadline), desc(productionTasks.createdAt)),

		db
			.select({
				id: freelancerLedgers.id,
				entryType: freelancerLedgers.entryType,
				amount: freelancerLedgers.amount,
				status: freelancerLedgers.status,
				description: freelancerLedgers.description,
				createdAt: freelancerLedgers.createdAt
			})
			.from(freelancerLedgers)
			.where(eq(freelancerLedgers.freelancerId, profile.id))
			.orderBy(desc(freelancerLedgers.createdAt))
			.limit(12),

		db
			.select()
			.from(withdrawalRequests)
			.where(eq(withdrawalRequests.userId, profile.id))
			.orderBy(desc(withdrawalRequests.createdAt))
			.limit(8),

		getWalletSummary(profile.id, 'FREELANCER')
	]);

	/* ------------------------------- Revisi ---------------------------------- */
	const taskIds = taskRows.map((t) => t.id);
	const revisionRows = taskIds.length
		? await db
				.select({
					id: revisions.id,
					taskId: revisions.taskId,
					revisionNo: revisions.revisionNo,
					notes: revisions.notes,
					isChargeable: revisions.isChargeable,
					status: revisions.status,
					createdAt: revisions.createdAt
				})
				.from(revisions)
				.where(inArray(revisions.taskId, taskIds))
				.orderBy(desc(revisions.createdAt))
		: [];

	const open = taskRows.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
	const overdue = open.filter((t) => {
		const d = daysUntil(t.deadline);
		return d !== null && d < 0;
	});

	const earned = taskRows
		.filter((t) => t.status === 'COMPLETED')
		.reduce((acc, t) => acc + toNumber(t.payoutAmount), 0);

	const openValue = open.reduce((acc, t) => acc + estimatedFee(t), 0);

	const withdrawalRowsMapped = withdrawalRows.map((w) => ({
		...w,
		amountNum: toNumber(w.amount)
	}));

	const commentMap = await commentsByTask(taskIds, false);

	return {
		profile: { fullName: profile.fullName, specialty: profile.specialty, isActive: profile.isActive },
		wallet: {
			...wallet,
			availableNum: toNumber(wallet.available),
			pendingNum: toNumber(wallet.pending),
			withdrawnNum: toNumber(wallet.withdrawn)
		},
		kpi: {
			openTasks: open.length,
			inProgress: open.filter((t) => t.status === 'IN_PROGRESS').length,
			awaitingReview: open.filter((t) => t.status === 'WAITING_AUTHOR_REVIEW').length,
			overdue: overdue.length,
			completed: taskRows.filter((t) => t.status === 'COMPLETED').length,
			earned,
			openValue,
			/** Revisi yang belum ditandai selesai. */
			openRevisions: revisionRows.filter((r) => r.status === 'REQUESTED').length
		},
		tasks: taskRows.map((t) => ({
			...t,
			days: daysUntil(t.deadline),
			/** Nilai yang sudah benar-benar dikreditkan (0 bila belum disetujui). */
			payoutNum: toNumber(t.payoutAmount),
			/** Perkiraan komisi untuk task yang belum disetujui. */
			feeNum: estimatedFee(t),
			revisions: revisionRows.filter((r) => r.taskId === t.id),
			comments: commentMap.get(t.id) ?? []
		})),
		ledger: ledgerRows.map((l) => ({ ...l, amountNum: toNumber(l.amount) })),
		withdrawals: withdrawalRowsMapped,
		/** Saran nominal penarikan cepat. */
		quickAmounts: [0.25, 0.5, 1].map((f) => Math.round((toNumber(wallet.available) * f) / 1000) * 1000),
		/** Batas minimum dari pengaturan, bukan konstanta di UI. */
		minimumWithdrawal: (await getWithdrawalSettings()).minimumAmount
	};
};

export const actions: Actions = {
	/** Freelancer mengirim hasil pekerjaan untuk direview penulis. */
	submit: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || profile.role !== 'FREELANCER') {
			return fail(403, { message: 'Hanya freelancer dapat mengirim hasil.' });
		}
		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		if (!taskId) return fail(400, { message: 'Task tidak dipilih.' });

		try {
			/*
			 * Kunci idempoten per task: kiriman ganda (dua tap, retry jaringan)
			 * tidak mengubah status task dua kali.
			 */
			const { value: result, replayed } = await runIdempotent({
				scope: `task.submit:${taskId}`,
				actorId: profile.id,
				requestId: readRequestId(form),
				work: () => submitTaskForReview(taskId, profile.id),
				serialize: (value) => ({ ...value })
			});

			if (!replayed) {
				const [task] = await db
					.select({ title: productionTasks.title, projectId: productionTasks.projectId })
					.from(productionTasks)
					.where(eq(productionTasks.id, taskId))
					.limit(1);

				await audit({
					actor: profile,
					action: 'task.submitted',
					entityType: 'task',
					entityId: taskId,
					summary: `Mengirim hasil untuk direview: ${task?.title ?? 'task'}.`,
					context: { projectId: task?.projectId ?? null },
					requestId: readRequestId(form)
				});
			}

			return {
				ok: true,
				replayed,
				message: replayed
					? 'Hasil ini sudah terkirim sebelumnya. Tidak ada perubahan baru.'
					: 'Hasil terkirim. Penulis akan menerima notifikasi review.'
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Pengajuan penarikan saldo komisi ke rekening bank. */
	'request-withdrawal': async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || profile.role !== 'FREELANCER') {
			return fail(403, { message: 'Hanya freelancer dapat mengajukan penarikan.' });
		}

		const form = await request.formData();
		const raw = String(form.get('amount') ?? '').replace(/[^\d]/g, '');
		const amount = Number.parseInt(raw, 10);
		const bankName = String(form.get('bankName') ?? '').trim();
		const bankAccountName = String(form.get('bankAccountName') ?? '').trim();
		const bankAccountNumber = String(form.get('bankAccountNumber') ?? '').trim();

		if (!Number.isFinite(amount) || amount <= 0) {
			return fail(400, { message: 'Nominal penarikan tidak valid.' });
		}
		if (!bankName || !bankAccountName || !bankAccountNumber) {
			return fail(400, { message: 'Lengkapi nama bank, pemilik rekening, dan nomor rekening.' });
		}

		try {
			/*
			 * Penarikan memotong saldo tersedia begitu diajukan. Tanpa kunci ini,
			 * dua POST bisa mengajukan dua penarikan dengan nominal yang sama.
			 */
			const { value: result } = await runIdempotent({
				scope: 'withdrawal.request',
				actorId: profile.id,
				requestId: readRequestId(form),
				work: () =>
					requestWithdrawal({
						userId: profile.id,
						wallet: 'FREELANCER',
						amount,
						bankName,
						bankAccountName,
						bankAccountNumber
					}),
				serialize: (value) => ({ ...value })
			});

			await audit({
				actor: profile,
				action: 'withdrawal.requested',
				entityType: 'withdrawal',
				entityId: result.withdrawalId,
				summary: `Mengajukan penarikan komisi ${toMoneyString(amount)} ke ${bankName} ***${bankAccountNumber.slice(-4)}.`,
				context: { amount, bankName },
				requestId: readRequestId(form)
			});

			return {
				ok: true,
				message: `Penarikan ${new Intl.NumberFormat('id-ID', {
					style: 'currency',
					currency: 'IDR',
					maximumFractionDigits: 0
				}).format(toNumber(result.amount))} diajukan. Menunggu persetujuan finance.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Komentar freelancer pada task — bagian dari benang diskusi. */
	comment: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || profile.role !== 'FREELANCER') {
			return fail(403, { message: 'Akses ditolak.' });
		}

		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		const body = String(form.get('body') ?? '').trim();

		if (!taskId) return fail(400, { message: 'Task tidak dipilih.' });
		if (body.length < 2) return fail(400, { message: 'Komentar terlalu pendek.' });
		if (body.length > 2000) return fail(400, { message: 'Komentar maksimal 2000 karakter.' });

		/* Task harus ditugaskan ke freelancer ini. */
		const [task] = await db
			.select({
				id: productionTasks.id,
				projectId: productionTasks.projectId,
				title: productionTasks.title,
				projectTitle: bookProjects.title
			})
			.from(productionTasks)
			.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
			.where(and(eq(productionTasks.id, taskId), eq(productionTasks.assigneeId, profile.id)))
			.limit(1);

		if (!task) return fail(404, { message: 'Task bukan untuk Anda.' });

		try {
			const comment = await addComment({
				taskId,
				projectId: task.projectId,
				author: profile,
				body,
				isInternal: false
			});

			await notifyComment({
				commentId: comment.id,
				taskId,
				taskTitle: task.title,
				projectTitle: task.projectTitle,
				authorName: profile.fullName,
				authorId: profile.id,
				isInternal: false
			});

			return { ok: true, message: 'Komentar ditambahkan ke diskusi task.' };
		} catch (e) {
			return toFailure(e);
		}
	}
};
