import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	fileAssets,
	inventory,
	invoices,
	orders,
	packages,
	productionTasks,
	revisions,
	royaltyLedgers,
	withdrawalRequests
} from '$db/schema';
import {
	approveProductionTask,
	getWalletSummary,
	requestWithdrawal,
	submitTaskRevision
} from '$lib/server/services/erpEngine';
import { commentsByTask, addComment } from '$lib/server/services/comments';
import { notifyComment } from '$lib/server/services/notifications';
import { assetDownloadUrl } from '$lib/server/services/fileUpload';
import { getWithdrawalSettings } from '$lib/server/services/settings';
import { audit } from '$lib/server/services/auditDraft';
import { readRequestId, runIdempotent } from '$lib/server/services/idempotency';
import { ErpError } from '$lib/server/services/erpErrors';
import { toNumber, toMoneyString } from '$lib/server/services/money';
import type { Actions, PageServerLoad } from './$types';

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/** Selisih hari terhadap hari ini; negatif berarti sudah lewat jatuh tempo. */
function daysUntil(date: string | Date | null): number | null {
	if (!date) return null;
	const target = typeof date === 'string' ? new Date(date) : date;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const d = new Date(target);
	d.setHours(0, 0, 0, 0);
	return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.profile;
	if (!profile) error(401, 'Silakan masuk terlebih dahulu.');
	if (profile.role !== 'AUTHOR') {
		error(403, 'Portal ini khusus untuk penulis.');
	}

	/* --------------------------- Order milik penulis --------------------------- */
	const orderRows = await db
		.select({
			orderId: orders.id,
			orderNumber: orders.orderNumber,
			orderStatus: orders.status,
			totalAmount: orders.totalAmount,
			paidAmount: orders.paidAmount,
			isFullyPaid: orders.isFullyPaid,
			authorRoyaltyPct: orders.authorRoyaltyPct,
			createdAt: orders.createdAt,
			projectId: bookProjects.id,
			title: bookProjects.title,
			subtitle: bookProjects.subtitle,
			synopsis: bookProjects.synopsis,
			genre: bookProjects.genre,
			status: bookProjects.status,
			pageCount: bookProjects.pageCount,
			paperType: bookProjects.paperType,
			bookSize: bookProjects.bookSize,
			binding: bookProjects.binding,
			lamination: bookProjects.lamination,
			isFullColor: bookProjects.isFullColor,
			editorialStage: bookProjects.editorialStage,
			coverStage: bookProjects.coverStage,
			legalStage: bookProjects.legalStage,
			printStage: bookProjects.printStage,
			isbn: bookProjects.isbn,
			kdtNumber: bookProjects.kdtNumber,
			isbnIssuedAt: bookProjects.isbnIssuedAt,
			layoutApprovedAt: bookProjects.layoutApprovedAt,
			coverApprovedAt: bookProjects.coverApprovedAt,
			highResUnlocked: bookProjects.highResUnlocked,
			packageName: packages.name
		})
		.from(orders)
		.innerJoin(packages, eq(packages.id, orders.packageId))
		.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
		.where(eq(orders.authorId, profile.id))
		.orderBy(desc(orders.createdAt));

	const orderIds = orderRows.map((o) => o.orderId);
	const projectIds = orderRows.map((o) => o.projectId).filter((id): id is string => Boolean(id));

	/* --------------------- Invoice, task, revisi, file, stok -------------------- */
	const [invoiceRows, taskRows, revisionRows, fileRows, stockRows] = await Promise.all([
		orderIds.length
			? db
					.select({
						id: invoices.id,
						invoiceNumber: invoices.invoiceNumber,
						kind: invoices.kind,
						status: invoices.status,
						amount: invoices.amount,
						paidAmount: invoices.paidAmount,
						dueDate: invoices.dueDate,
						paidAt: invoices.paidAt,
						description: invoices.description,
						orderId: invoices.orderId
					})
					.from(invoices)
					.where(inArray(invoices.orderId, orderIds))
					.orderBy(asc(invoices.dueDate))
			: [],

		projectIds.length
			? db
					.select({
						id: productionTasks.id,
						projectId: productionTasks.projectId,
						track: productionTasks.track,
						title: productionTasks.title,
						description: productionTasks.description,
						status: productionTasks.status,
						revisionCount: productionTasks.revisionCount,
						maxRevisions: productionTasks.maxRevisions,
						extraRevisionFee: productionTasks.extraRevisionFee,
						isUnlocked: productionTasks.isUnlocked,
						submittedAt: productionTasks.submittedAt,
						approvedAt: productionTasks.approvedAt
					})
					.from(productionTasks)
					.where(inArray(productionTasks.projectId, projectIds))
					.orderBy(asc(productionTasks.createdAt))
			: [],

		projectIds.length
			? db
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
					.where(inArray(revisions.projectId, projectIds))
					.orderBy(desc(revisions.createdAt))
			: [],

		projectIds.length
			? db
					.select({
						id: fileAssets.id,
						projectId: fileAssets.projectId,
						kind: fileAssets.kind,
						bucket: fileAssets.bucket,
						storagePath: fileAssets.storagePath,
						fileName: fileAssets.fileName,
						sizeBytes: fileAssets.sizeBytes,
						version: fileAssets.version,
						isPreview: fileAssets.isPreview,
						requiresFullPayment: fileAssets.requiresFullPayment,
						createdAt: fileAssets.createdAt
					})
					.from(fileAssets)
					.where(inArray(fileAssets.projectId, projectIds))
					.orderBy(desc(fileAssets.createdAt))
			: [],

		projectIds.length
			? db
					.select({
						projectId: inventory.projectId,
						onHand: inventory.onHand,
						reserved: inventory.reserved,
						soldTotal: inventory.soldTotal,
						retailPrice: inventory.retailPrice
					})
					.from(inventory)
					.where(inArray(inventory.projectId, projectIds))
			: []
	]);

	/* ------------------------------- Dompet royalti ---------------------------- */
	const [ledgerRows, withdrawalRows, wallet] = await Promise.all([
		db
			.select({
				id: royaltyLedgers.id,
				entryType: royaltyLedgers.entryType,
				amount: royaltyLedgers.amount,
				status: royaltyLedgers.status,
				description: royaltyLedgers.description,
				projectId: royaltyLedgers.projectId,
				createdAt: royaltyLedgers.createdAt
			})
			.from(royaltyLedgers)
			.where(eq(royaltyLedgers.authorId, profile.id))
			.orderBy(desc(royaltyLedgers.createdAt))
			.limit(15),

		db
			.select()
			.from(withdrawalRequests)
			.where(eq(withdrawalRequests.userId, profile.id))
			.orderBy(desc(withdrawalRequests.createdAt))
			.limit(8),

		getWalletSummary(profile.id, 'ROYALTY')
	]);

	/* --------------------------------- Turunan -------------------------------- */
	const outstandingOf = (i: (typeof invoiceRows)[number]) =>
		Math.max(0, toNumber(i.amount) - toNumber(i.paidAmount));

	const billable = invoiceRows.filter((i) => i.status !== 'VOID');
	const openInvoices = billable
		.filter((i) => i.status !== 'PAID' && outstandingOf(i) > 0)
		.map((i) => ({ ...i, outstanding: outstandingOf(i), days: daysUntil(i.dueDate) }));

	const waiting = taskRows.filter((t) => t.status === 'WAITING_AUTHOR_REVIEW');

	/*
	 * Penulis hanya menerima komentar non-internal. Keputusan visibilitas
	 * dibuat di SQL (`includeInternal: false`), bukan disembunyikan di UI —
	 * catatan staf tidak boleh ke mana-mana lewat response halaman ini.
	 */
	const taskCommentMap = await commentsByTask(
		taskRows.map((t) => t.id),
		false
	);

	const projects = await Promise.all(
		orderRows.map(async (o) => {
			const orderInvoices = billable.filter((i) => i.orderId === o.orderId);
			const outstanding = orderInvoices.reduce((acc, i) => acc + outstandingOf(i), 0);
			const tasks = taskRows
				.filter((t) => t.projectId === o.projectId)
				.map((t) => ({
					...t,
					revisions: revisionRows.filter((r) => r.taskId === t.id).slice(0, 3),
					comments: taskCommentMap.get(t.id) ?? []
				}));

			/*
			 * Tautan unduh dihitung setelah `highResUnlocked` diketahui, supaya
			 * berkas master yang masih terkunci tidak menghasilkan URL yang akan
			 * ditolak route penyaji.
			 */
			const files = await Promise.all(
				fileRows
					.filter((f) => f.projectId === o.projectId)
					.map(async (f) => ({
						...f,
						url: await assetDownloadUrl({ ...f, highResUnlocked: Boolean(o.highResUnlocked) })
					}))
			);

			return {
				...o,
				totalNum: toNumber(o.totalAmount),
				paidNum: toNumber(o.paidAmount),
				outstanding,
				progressPct:
					toNumber(o.totalAmount) > 0 ? (toNumber(o.paidAmount) / toNumber(o.totalAmount)) * 100 : 0,
				invoiceCount: orderInvoices.length,
				tasks,
				waitingTasks: tasks.filter((t) => t.status === 'WAITING_AUTHOR_REVIEW'),
				files,
				stock: stockRows.find((s) => s.projectId === o.projectId) ?? null
			};
		})
	);

	return {
		profile: {
			fullName: profile.fullName,
			email: profile.email,
			isActive: profile.isActive
		},
		wallet: {
			...wallet,
			availableNum: toNumber(wallet.available),
			pendingNum: toNumber(wallet.pending),
			withdrawnNum: toNumber(wallet.withdrawn)
		},
		kpi: {
			projectCount: projects.length,
			activeCount: projects.filter(
				(p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED' && p.status !== 'ON_HOLD'
			).length,
			publishedCount: projects.filter((p) => p.status === 'PUBLISHED' || p.status === 'COMPLETED')
				.length,
			awaitingReview: waiting.length,
			outstanding: openInvoices.reduce((acc, i) => acc + i.outstanding, 0),
			overdueCount: openInvoices.filter((i) => i.days !== null && i.days < 0).length,
			royaltyEarned: toNumber(wallet.available) + toNumber(wallet.withdrawn) + toNumber(wallet.pending),
			copiesOnHand: stockRows.reduce((acc, s) => acc + Math.max(0, s.onHand - s.reserved), 0)
		},
		projects,
		openInvoices,
		ledger: ledgerRows.map((l) => ({ ...l, amountNum: toNumber(l.amount) })),
		withdrawals: withdrawalRows.map((w) => ({ ...w, amountNum: toNumber(w.amount) })),
		quickAmounts: [0.25, 0.5, 1].map((f) => Math.round((toNumber(wallet.available) * f) / 1000) * 1000),
		/** Batas minimum dari pengaturan, bukan konstanta di UI. */
		minimumWithdrawal: (await getWithdrawalSettings()).minimumAmount
	};
};

export const actions: Actions = {
	/** Penulis menyetujui hasil cover / layout. */
	'approve-task': async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || profile.role !== 'AUTHOR') {
			return fail(403, { message: 'Hanya penulis yang dapat menyetujui hasil.' });
		}
		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		if (!taskId) return fail(400, { message: 'Task tidak dipilih.' });

		try {
			/*
			 * Approval mengkreditkan komisi freelancer dan membuka tahap
			 * berikutnya. Kunci per task memastikan satu tap ganda tidak
			 * menghasilkan dua kredit atau dua unlock.
			 */
			const { value: result, replayed } = await runIdempotent({
				scope: `task.approve:${taskId}`,
				actorId: profile.id,
				requestId: readRequestId(form),
				work: () => approveProductionTask(taskId, profile.id),
				serialize: (value) => ({ ...value })
			});

			if (!replayed) {
				await audit({
					actor: profile,
					action: 'task.approved',
					entityType: 'task',
					entityId: taskId,
					summary: `Menyetujui hasil task. ${result.commissionCredited ? `Komisi freelancer ${toMoneyString(toNumber(result.payoutAmount))} masuk ke dompet.` : ''}`.trim(),
					context: { projectId: result.projectId, commissionCredited: result.commissionCredited },
					requestId: readRequestId(form)
				});
			}

			return {
				ok: true,
				replayed,
				message: replayed
					? 'Hasil ini sudah disetujui sebelumnya. Tidak ada perubahan baru.'
					: result.projectAutoUnlocks.length > 0
						? `Hasil disetujui. Tahap lanjutan terbuka: ${result.projectAutoUnlocks.join(', ')}.`
						: 'Hasil disetujui. Freelancer menerima komisinya.'
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Revisi dari penulis — kuota gratis dulu, lalu invoice add-on. */
	'request-revision': async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || profile.role !== 'AUTHOR') {
			return fail(403, { message: 'Hanya penulis yang dapat mengajukan revisi.' });
		}
		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		const notes = String(form.get('notes') ?? '').trim();
		if (!taskId) return fail(400, { message: 'Task tidak dipilih.' });
		if (notes.length < 5) {
			return fail(400, { message: 'Jelaskan revisi yang diinginkan minimal 5 karakter.' });
		}

		try {
			/*
			 * Revisi bisa membuat invoice add-on. Kiriman ganda harus berhenti di
			 * sini, kalau tidak penulis bisa ditagih dua kali untuk satu permintaan.
			 */
			const { value: result, replayed } = await runIdempotent({
				scope: `revision.request:${taskId}`,
				actorId: profile.id,
				requestId: readRequestId(form),
				work: () => submitTaskRevision(taskId, notes, profile.id),
				serialize: (value) => ({ ...value })
			});

			if (!replayed) {
				await audit({
					actor: profile,
					action: 'revision.requested',
					entityType: 'revision',
					entityId: result.revisionId,
					summary: `Meminta revisi #${result.revisionNo}. ${result.isChargeable ? `Biaya tagihan — invoice ${result.invoiceNumber}.` : 'Masih dalam kuota gratis.'}`.trim(),
					context: { taskId, projectId: result.projectId, revisionNo: result.revisionNo, chargeable: result.isChargeable },
					requestId: readRequestId(form)
				});
			}

			return {
				ok: true,
				replayed,
				message: replayed
					? 'Revisi ini sudah terkirim sebelumnya. Tidak ada permintaan baru.'
					: result.isChargeable
						? `Kuota revisi gratis habis. Invoice ${result.invoiceNumber} dibuat — pekerjaan berlanjut setelah dibayar.`
						: `Revisi #${result.revisionNo} dikirim. Sisa kuota gratis: ${result.remainingFreeRevisions}.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Penarikan royalti ke rekening bank. */
	'request-withdrawal': async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || profile.role !== 'AUTHOR') {
			return fail(403, { message: 'Hanya penulis yang dapat menarik royalti.' });
		}
		const form = await request.formData();
		const amount = Number.parseInt(String(form.get('amount') ?? '').replace(/[^\d]/g, ''), 10);
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
			const { value: result } = await runIdempotent({
				scope: 'withdrawal.request',
				actorId: profile.id,
				requestId: readRequestId(form),
				work: () =>
					requestWithdrawal({
						userId: profile.id,
						wallet: 'ROYALTY',
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
				summary: `Mengajukan penarikan royalti ${toMoneyString(amount)} ke ${bankName} ***${bankAccountNumber.slice(-4)}.`,
				context: { amount, bankName },
				requestId: readRequestId(form)
			});

			return {
				ok: true,
				message: `Penarikan royalti diajukan (${result.withdrawalId.slice(0, 8)}). Menunggu persetujuan finance.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/**
	 * Komentar penulis pada task — bagian dari benang diskusi revisi.
	 * Penulis tidak bisa menandai internal: diskusi antara karyanya dan
	 * tim produksi justru dibagikan ke semua pihak yang terlibat.
	 */
	comment: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || profile.role !== 'AUTHOR') {
			return fail(403, { message: 'Akses ditolak.' });
		}

		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		const body = String(form.get('body') ?? '').trim();

		if (!taskId) return fail(400, { message: 'Task tidak dipilih.' });
		if (body.length < 2) return fail(400, { message: 'Komentar terlalu pendek.' });
		if (body.length > 2000) return fail(400, { message: 'Komentar maksimal 2000 karakter.' });

		/* Task harus milik proyek penulis ini — cegah komentar nyasar. */
		const [task] = await db
			.select({
				id: productionTasks.id,
				projectId: productionTasks.projectId,
				title: productionTasks.title,
				projectTitle: bookProjects.title
			})
			.from(productionTasks)
			.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
			.innerJoin(orders, eq(orders.id, bookProjects.orderId))
			.where(
				and(eq(productionTasks.id, taskId), eq(orders.authorId, profile.id))
			)
			.limit(1);

		if (!task) return fail(404, { message: 'Task tidak ditemukan untuk proyek Anda.' });

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
