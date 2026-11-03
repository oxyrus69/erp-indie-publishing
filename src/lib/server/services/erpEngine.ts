import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	bookSales,
	documentSequences,
	freelancerLedgers,
	inventory,
	invoicePayments,
	invoices,
	orders,
	printRuns,
	productionTasks,
	profiles,
	revisions,
	royaltyLedgers,
	withdrawalRequests,
	type FeeStructure,
	type InvoiceKind,
	type SalesChannel
} from '$db/schema';
import { ErpError, fail } from './erpErrors';
import { rupiah, toMoneyString, toNumber } from './money';
import { getDocumentSettings, getWithdrawalSettings } from './settings';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* -------------------------------------------------------------------------- */
/*                             DOCUMENT NUMBERING                             */
/* -------------------------------------------------------------------------- */

function periodKey(date = new Date()): string {
	return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Nomor dokumen atomik: `INV-202610-0007`.
 * Memakai UPSERT ... RETURNING sehingga aman terhadap request paralel.
 *
 * Prefix berasal dari pengaturan (bisa diubah tanpa deploy); `defaultPrefix`
 * hanya jaring pengaman bila pengaturan belum pernah dibaca.
 */
async function nextDocumentNumber(
	tx: Tx,
	defaultPrefix: string,
	date = new Date()
): Promise<string> {
	const doc = await getDocumentSettings();
	const prefix =
		defaultPrefix === 'INV'
			? doc.invoicePrefix
			: defaultPrefix === 'SALE'
				? doc.salesPrefix
				: defaultPrefix === 'WDR'
					? doc.withdrawalPrefix
					: defaultPrefix;

	const period = periodKey(date);
	const key = `${prefix}:${period}`;
	const [row] = await tx
		.insert(documentSequences)
		.values({ key, lastValue: 1 })
		.onConflictDoUpdate({
			target: documentSequences.key,
			set: { lastValue: sql`${documentSequences.lastValue} + 1` }
		})
		.returning({ lastValue: documentSequences.lastValue });

	const seq = row?.lastValue ?? 1;
	return `${prefix}-${period}-${String(seq).padStart(4, '0')}`;
}

/* -------------------------------------------------------------------------- */
/*                          PROJECT FACTORY (PIPELINE)                        */
/* -------------------------------------------------------------------------- */

/**
 * Membuat BookProject + 5 task pipeline + baris inventori ketika DP lunas.
 * Idempoten: bila proyek untuk order ini sudah ada, langsung dikembalikan.
 */
async function initializeProjectForOrder(tx: Tx, orderId: string): Promise<string> {
	const [existing] = await tx
		.select({ id: bookProjects.id })
		.from(bookProjects)
		.where(eq(bookProjects.orderId, orderId))
		.limit(1);
	if (existing) return existing.id;

	const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
	if (!order) fail('NOT_FOUND', 'Order tidak ditemukan saat inisialisasi proyek.');

	const [author] = await tx
		.select({ fullName: profiles.fullName })
		.from(profiles)
		.where(eq(profiles.id, order.authorId))
		.limit(1);

	const [project] = await tx
		.insert(bookProjects)
		.values({
			orderId,
			title: order.bookTitle ?? 'Naskah Tanpa Judul',
			subtitle: order.bookSubtitle,
			authorName: author?.fullName ?? 'Penulis',
			status: 'IN_PRODUCTION',
			editorialStage: 'MANUSCRIPT_SUBMITTED',
			coverStage: 'BRIEF_SUBMITTED',
			legalStage: 'PENDING_FILES'
		})
		.returning({ id: bookProjects.id });

	if (!project) fail('INVALID_STATE', 'Gagal membuat proyek buku.');

	await tx.insert(productionTasks).values([
		{
			projectId: project.id,
			track: 'EDITORIAL',
			stage: 'EDITING',
			title: 'Penyuntingan Naskah',
			description: 'Penyuntingan struktur, ejaan, dan konsistensi naskah.',
			status: 'PENDING',
			feeStructure: 'FLAT_FEE',
			maxRevisions: order.maxLayoutRevisions,
			isUnlocked: true
		},
		{
			projectId: project.id,
			track: 'LAYOUT',
			stage: 'LAYOUTING',
			title: 'Tata Letak & Proofreading Akhir',
			description: 'Layout cetak siap press beserta proofread akhir.',
			status: 'PENDING',
			feeStructure: 'FLAT_FEE',
			maxRevisions: order.maxLayoutRevisions,
			isUnlocked: true
		},
		{
			projectId: project.id,
			track: 'COVER',
			stage: 'DRAFTING_COVER',
			title: 'Desain Cover',
			description: 'Desain cover depan, punggung, dan belakang.',
			status: 'PENDING',
			feeStructure: 'FLAT_FEE',
			maxRevisions: order.maxCoverRevisions,
			isUnlocked: true
		},
		{
			projectId: project.id,
			track: 'LEGAL',
			stage: 'SUBMITTED_TO_PERPUSNAS',
			title: 'Pengurusan ISBN & KDT',
			description: 'Pendaftaran ISBN ke Perpusnas dan penerbitan barcode.',
			status: 'PENDING',
			feeStructure: 'FLAT_FEE',
			/** Terkunci sampai pelunasan — ISBN dirilis setelah lunas. */
			isUnlocked: false
		},
		{
			projectId: project.id,
			track: 'PRINT',
			stage: 'PRINT_QUEUE',
			title: 'Produksi Cetak',
			description: 'Antrean cetak POD/offset dan quality control.',
			status: 'PENDING',
			feeStructure: 'FLAT_FEE',
			isUnlocked: false
		}
	]);

	await tx
		.insert(inventory)
		.values({ projectId: project.id, retailPrice: '0', avgProductionCost: '0' })
		.onConflictDoNothing();

	return project.id;
}

/* -------------------------------------------------------------------------- */
/*                         1. HANDLE INVOICE PAID                             */
/* -------------------------------------------------------------------------- */

export type InvoicePaidResult = {
	invoiceId: string;
	invoiceNumber: string;
	kind: InvoiceKind;
	alreadyPaid: boolean;
	orderFullyPaid: boolean;
	projectId: string | null;
	unlocked: string[];
};

/**
 * Dipanggil ketika sebuah invoice diverifikasi lunas (transfer bank, VA, dsb).
 *
 * Efek:
 *  - DOWN_PAYMENT        → inisialisasi pipeline produksi paralel.
 *  - FINAL_SETTLEMENT    → buka track ISBN + cetak, buka file high-res.
 *  - EXTRA_REVISION      → buka kembali task & tambah kuota revisi 1.
 *  - ADDON/PRINT_ADDON   → catat pembayaran, buka track cetak bila perlu.
 *
 * Semua perubahan (invoice, order, proyek, task) berada dalam satu transaksi.
 */
export async function handleInvoicePaid(invoiceId: string): Promise<InvoicePaidResult> {
	return db.transaction(async (tx) => {
		const [invoice] = await tx
			.select()
			.from(invoices)
			.where(eq(invoices.id, invoiceId))
			.for('update')
			.limit(1);

		if (!invoice) fail('NOT_FOUND', 'Invoice tidak ditemukan.');

		const [order] = await tx
			.select()
			.from(orders)
			.where(eq(orders.id, invoice.orderId))
			.for('update')
			.limit(1);
		if (!order) fail('NOT_FOUND', 'Order untuk invoice ini tidak ditemukan.');

		const unlocked: string[] = [];

		/** Idempoten: pembayaran ganda tidak boleh menggandakan efek samping. */
		if (invoice.status === 'PAID') {
			const [project] = await tx
				.select({ id: bookProjects.id })
				.from(bookProjects)
				.where(eq(bookProjects.orderId, order.id))
				.limit(1);
			return {
				invoiceId: invoice.id,
				invoiceNumber: invoice.invoiceNumber,
				kind: invoice.kind,
				alreadyPaid: true,
				orderFullyPaid: order.isFullyPaid,
				projectId: project?.id ?? null,
				unlocked
			};
		}

		if (invoice.status === 'VOID') {
			fail('INVALID_STATE', 'Invoice sudah dibatalkan dan tidak bisa dibayar.');
		}

		const paidAt = new Date();
		const remaining = Math.max(0, toNumber(invoice.amount) - toNumber(invoice.paidAmount));

		if (remaining > 0) {
			await tx.insert(invoicePayments).values({
				invoiceId: invoice.id,
				amount: toMoneyString(remaining),
				method: 'TRANSFER',
				reference: `VERIFIED-${invoice.invoiceNumber}`,
				paidAt
			});
		}

		await tx
			.update(invoices)
			.set({ status: 'PAID', paidAt, paidAmount: toMoneyString(toNumber(invoice.amount)) })
			.where(eq(invoices.id, invoice.id));

		/* ---------------- Hitung ulang status finansial order ---------------- */
		const orderInvoices = await tx
			.select({
				id: invoices.id,
				amount: invoices.amount,
				paidAmount: invoices.paidAmount,
				status: invoices.status
			})
			.from(invoices)
			.where(eq(invoices.orderId, order.id));

		const active = orderInvoices.filter((i) => i.status !== 'VOID');
		const outstanding = active.filter((i) => i.status !== 'PAID');
		const totalPaid = active.reduce((acc, i) => acc + toNumber(i.paidAmount), 0);
		const isFullyPaid = active.length > 0 && outstanding.length === 0;

		const paidKind = invoice.kind;

		let projectId: string | null = null;
		const [existingProject] = await tx
			.select({ id: bookProjects.id })
			.from(bookProjects)
			.where(eq(bookProjects.orderId, order.id))
			.limit(1);

		/* ---------------- Efek per jenis invoice ---------------- */
		if (paidKind === 'DOWN_PAYMENT') {
			projectId = await initializeProjectForOrder(tx, order.id);
			unlocked.push('PIPELINE_INITIALIZED');
			await tx
				.update(orders)
				.set({ status: 'IN_PRODUCTION' })
				.where(eq(orders.id, order.id));
		}

		if (paidKind === 'FINAL_SETTLEMENT' && existingProject) {
			projectId = existingProject.id;

			/** ISBN & cetak baru boleh berjalan setelah pelunasan. */
			await tx
				.update(productionTasks)
				.set({ isUnlocked: true })
				.where(
					and(
						eq(productionTasks.projectId, projectId),
						inArray(productionTasks.track, ['LEGAL', 'PRINT'])
					)
				);
			unlocked.push('ISBN_TRACK', 'PRINT_TRACK');
		}

		if (paidKind === 'EXTRA_REVISION' && invoice.productionTaskId) {
			const [task] = await tx
				.select()
				.from(productionTasks)
				.where(eq(productionTasks.id, invoice.productionTaskId))
				.for('update')
				.limit(1);

			if (task) {
				/** Kuota revisi bertambah 1 karena penulis membayar add-on. */
				await tx
					.update(productionTasks)
					.set({
						isUnlocked: true,
						maxRevisions: task.maxRevisions + 1,
						status: 'IN_PROGRESS',
						updatedAt: new Date()
					})
					.where(eq(productionTasks.id, task.id));

				await tx
					.update(revisions)
					.set({ status: 'PAID' })
					.where(eq(revisions.feeInvoiceId, invoice.id));

				projectId = task.projectId;
				unlocked.push('EXTRA_REVISION_QUOTA');
			}
		}

		if (paidKind === 'PRINT_ADDON' && existingProject) {
			projectId = existingProject.id;
			await tx
				.update(productionTasks)
				.set({ isUnlocked: true })
				.where(
					and(
						eq(productionTasks.projectId, projectId),
						eq(productionTasks.track, 'PRINT')
					)
				);
			unlocked.push('PRINT_TRACK');
		}

		/* ---------------- Unlock file master bila lunas penuh ---------------- */
		if (isFullyPaid && projectId) {
			const [project] = await tx
				.select({
					id: bookProjects.id,
					coverApprovedAt: bookProjects.coverApprovedAt,
					layoutApprovedAt: bookProjects.layoutApprovedAt,
					highResUnlocked: bookProjects.highResUnlocked
				})
				.from(bookProjects)
				.where(eq(bookProjects.id, projectId))
				.for('update')
				.limit(1);

			const bothApproved = Boolean(project?.coverApprovedAt && project?.layoutApprovedAt);
			if (project && bothApproved && !project.highResUnlocked) {
				await tx
					.update(bookProjects)
					.set({ highResUnlocked: true })
					.where(eq(bookProjects.id, projectId));
				unlocked.push('HIGH_RES_FILES');
			} else if (project && !bothApproved) {
				/** Lunas, tetapi file master menunggu approval cover & layout. */
				unlocked.push('HIGH_RES_PENDING_APPROVAL');
			} else if (project?.highResUnlocked) {
				unlocked.push('HIGH_RES_FILES');
			}
		}

		const nextStatus: (typeof orders.$inferSelect)['status'] = isFullyPaid
			? 'READY_FOR_RELEASE'
			: paidKind === 'DOWN_PAYMENT' || existingProject
				? 'IN_PRODUCTION'
				: 'AWAITING_DOWN_PAYMENT';

		await tx
			.update(orders)
			.set({
				isFullyPaid,
				paidAmount: toMoneyString(totalPaid),
				status: nextStatus,
				updatedAt: new Date()
			})
			.where(eq(orders.id, order.id));

		if (projectId) {
			await tx
				.update(bookProjects)
				.set({ status: isFullyPaid ? 'READY_FOR_PRINT' : 'IN_PRODUCTION', updatedAt: new Date() })
				.where(eq(bookProjects.id, projectId));
		}

		return {
			invoiceId: invoice.id,
			invoiceNumber: invoice.invoiceNumber,
			kind: invoice.kind,
			alreadyPaid: false,
			orderFullyPaid: isFullyPaid,
			projectId,
			unlocked
		};
	});
}

/* -------------------------------------------------------------------------- */
/*                        2. SUBMIT TASK REVISION                             */
/* -------------------------------------------------------------------------- */

export type SubmitRevisionResult = {
	taskId: string;
	projectId: string;
	revisionId: string;
	revisionNo: number;
	isChargeable: boolean;
	remainingFreeRevisions: number;
	invoiceId: string | null;
	invoiceNumber: string | null;
	invoiceAmount: string | null;
	status: 'IN_PROGRESS' | 'AWAITING_PAYMENT';
};

/**
 * Revisi dari penulis. Selama kuota gratis tersedia, task kembali dikerjakan.
 * Jika kuota habis, revisi TIDAK memblokir pekerjaan diam-diam: sistem membuat
 * invoice add-on "Revisi Ekstra" dan task menunggu pembayaran.
 */
export async function submitTaskRevision(
	taskId: string,
	authorNotes: string,
	requestedBy: string
): Promise<SubmitRevisionResult> {
	const notes = authorNotes.trim();
	if (notes.length < 5) {
		fail('INVALID_STATE', 'Catatan revisi minimal 5 karakter agar desainer memahami permintaan.');
	}

	return db.transaction(async (tx) => {
		const [task] = await tx
			.select()
			.from(productionTasks)
			.where(eq(productionTasks.id, taskId))
			.for('update')
			.limit(1);
		if (!task) fail('NOT_FOUND', 'Task produksi tidak ditemukan.');

		const [project] = await tx
			.select()
			.from(bookProjects)
			.where(eq(bookProjects.id, task.projectId))
			.for('update')
			.limit(1);
		if (!project) fail('NOT_FOUND', 'Proyek buku tidak ditemukan.');

		const [order] = await tx
			.select()
			.from(orders)
			.where(eq(orders.id, project.orderId))
			.for('update')
			.limit(1);
		if (!order) fail('NOT_FOUND', 'Order proyek tidak ditemukan.');

		if (order.authorId !== requestedBy) {
			fail('FORBIDDEN', 'Hanya penulis pemilik proyek yang dapat mengajukan revisi.');
		}
		if (task.status !== 'WAITING_AUTHOR_REVIEW' && task.status !== 'COMPLETED') {
			fail(
				'INVALID_STATE',
				'Revisi hanya bisa diajukan setelah hasil pekerjaan dikirim untuk direview.'
			);
		}
		if (!task.isUnlocked) {
			fail('INVALID_STATE', 'Task ini sedang terkunci menunggu pembayaran.');
		}

		const revisionNo = task.revisionCount + 1;
		const hasFreeQuota = task.revisionCount < task.maxRevisions;

		if (hasFreeQuota) {
			const [revision] = await tx
				.insert(revisions)
				.values({
					taskId: task.id,
					projectId: project.id,
					revisionNo,
					requestedBy,
					notes,
					isChargeable: false,
					status: 'IN_PROGRESS'
				})
				.returning({ id: revisions.id });

			await tx
				.update(productionTasks)
				.set({
					revisionCount: revisionNo,
					status: 'IN_PROGRESS',
					submittedAt: null,
					approvedAt: null,
					updatedAt: new Date()
				})
				.where(eq(productionTasks.id, task.id));

			/** Kembalikan stage proyek ke pengerjaan ulang. */
			if (task.track === 'COVER') {
				await tx
					.update(bookProjects)
					.set({ coverStage: 'DRAFTING_COVER', coverApprovedAt: null, highResUnlocked: false })
					.where(eq(bookProjects.id, project.id));
			} else if (task.track === 'LAYOUT' || task.track === 'EDITORIAL') {
				await tx
					.update(bookProjects)
					.set({
						editorialStage: 'LAYOUTING',
						layoutApprovedAt: null,
						highResUnlocked: false
					})
					.where(eq(bookProjects.id, project.id));
			}

			return {
				taskId: task.id,
				projectId: project.id,
				revisionId: revision!.id,
				revisionNo,
				isChargeable: false,
				remainingFreeRevisions: Math.max(0, task.maxRevisions - revisionNo),
				invoiceId: null,
				invoiceNumber: null,
				invoiceAmount: null,
				status: 'IN_PROGRESS' as const
			};
		}

		/* ---------------- Kuota habis → invoice add-on otomatis ---------------- */
		const invoiceNumber = await nextDocumentNumber(tx, 'INV');
		const amount = toMoneyString(toNumber(task.extraRevisionFee));

		const [invoice] = await tx
			.insert(invoices)
			.values({
				invoiceNumber,
				orderId: order.id,
				kind: 'EXTRA_REVISION',
				status: 'UNPAID',
				amount,
				productionTaskId: task.id,
				description: `Revisi ekstra #${revisionNo} — ${task.title}`,
				dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
			})
			.returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

		if (!invoice) fail('INVALID_STATE', 'Gagal membuat invoice revisi ekstra.');

		const [revision] = await tx
			.insert(revisions)
			.values({
				taskId: task.id,
				projectId: project.id,
				revisionNo,
				requestedBy,
				notes,
				isChargeable: true,
				feeInvoiceId: invoice.id,
				status: 'AWAITING_PAYMENT'
			})
			.returning({ id: revisions.id });

		/** Task dikunci sampai invoice add-on lunas. */
		await tx
			.update(productionTasks)
			.set({ isUnlocked: false, updatedAt: new Date() })
			.where(eq(productionTasks.id, task.id));

		/** Invoice baru membuat order tidak lagi "fully paid". */
		await tx
			.update(orders)
			.set({ isFullyPaid: false, status: 'IN_PRODUCTION', updatedAt: new Date() })
			.where(eq(orders.id, order.id));

		await tx
			.update(bookProjects)
			.set({ highResUnlocked: false, updatedAt: new Date() })
			.where(eq(bookProjects.id, project.id));

		return {
			taskId: task.id,
			projectId: project.id,
			revisionId: revision?.id ?? '',
			revisionNo,
			isChargeable: true,
			remainingFreeRevisions: 0,
			invoiceId: invoice.id,
			invoiceNumber: invoice.invoiceNumber,
			invoiceAmount: amount,
			status: 'AWAITING_PAYMENT' as const
		};
	});
}

/* -------------------------------------------------------------------------- */
/*                      3. APPROVE PRODUCTION TASK                            */
/* -------------------------------------------------------------------------- */

export type ApproveTaskResult = {
	taskId: string;
	projectId: string;
	taskTitle: string;
	track: string;
	status: 'COMPLETED';
	commissionCredited: boolean;
	payoutAmount: string;
	projectAutoUnlocks: string[];
};

function computePayout(task: {
	feeStructure: FeeStructure;
	flatFee: string;
	perPageRate: string;
	pageCount: number;
}): string {
	if (task.feeStructure === 'PER_PAGE_RATE') {
		return toMoneyString(toNumber(task.perPageRate) * Math.max(0, task.pageCount));
	}
	return toMoneyString(toNumber(task.flatFee));
}

/**
 * Penulis menyetujui hasil akhir (cover / layout).
 *
 * Satu transaksi atomik:
 *  1. task → COMPLETED
 *  2. kredit komisi freelancer (idempoten via idempotency_key)
 *  3. update stage track di proyek
 *  4. bila cover+layout disetujui → buka track ISBN
 *  5. bila sudah lunas & dua approval lengkap → buka file high-res
 */
export async function approveProductionTask(
	taskId: string,
	authorId: string
): Promise<ApproveTaskResult> {
	return db.transaction(async (tx) => {
		const [task] = await tx
			.select()
			.from(productionTasks)
			.where(eq(productionTasks.id, taskId))
			.for('update')
			.limit(1);
		if (!task) fail('NOT_FOUND', 'Task produksi tidak ditemukan.');

		const [project] = await tx
			.select()
			.from(bookProjects)
			.where(eq(bookProjects.id, task.projectId))
			.for('update')
			.limit(1);
		if (!project) fail('NOT_FOUND', 'Proyek buku tidak ditemukan.');

		const [order] = await tx
			.select()
			.from(orders)
			.where(eq(orders.id, project.orderId))
			.for('update')
			.limit(1);
		if (!order) fail('NOT_FOUND', 'Order proyek tidak ditemukan.');

		if (order.authorId !== authorId) {
			fail('FORBIDDEN', 'Hanya penulis pemilik proyek yang dapat menyetujui hasil.');
		}
		if (task.status === 'COMPLETED') {
			return {
				taskId: task.id,
				projectId: project.id,
				taskTitle: task.title,
				track: task.track,
				status: 'COMPLETED' as const,
				commissionCredited: task.isCommissionCredited,
				payoutAmount: task.payoutAmount,
				projectAutoUnlocks: []
			};
		}
		if (task.status !== 'WAITING_AUTHOR_REVIEW') {
			fail('INVALID_STATE', 'Hasil belum dikirim untuk direview, belum bisa disetujui.');
		}
		if (!task.isUnlocked) {
			fail('INVALID_STATE', 'Task masih terkunci menunggu pembayaran revisi.');
		}

		const now = new Date();
		const payout = computePayout(task);

		await tx
			.update(productionTasks)
			.set({
				status: 'COMPLETED',
				approvedAt: now,
				approvedBy: authorId,
				payoutAmount: payout,
				isCommissionCredited: Boolean(task.assigneeId),
				updatedAt: now
			})
			.where(eq(productionTasks.id, task.id));

		/* ---------------- Kredit komisi freelancer (atomik & idempoten) ---------------- */
		let commissionCredited = false;
		if (task.assigneeId && toNumber(payout) > 0) {
			const inserted = await tx
				.insert(freelancerLedgers)
				.values({
					freelancerId: task.assigneeId,
					taskId: task.id,
					entryType: 'TASK_COMMISSION',
					amount: payout,
					status: 'AVAILABLE',
					description: `Komisi ${task.title} — ${project.title}`,
					idempotencyKey: `task:${task.id}:commission`
				})
				.onConflictDoNothing({ target: freelancerLedgers.idempotencyKey })
				.returning({ id: freelancerLedgers.id });
			commissionCredited = inserted.length > 0;
		}

		/* ---------------- Stage track proyek ---------------- */
		const autoUnlocks: string[] = [];
		let coverApproved = Boolean(project.coverApprovedAt);
		let layoutApproved = Boolean(project.layoutApprovedAt);

		if (task.track === 'COVER') {
			await tx
				.update(bookProjects)
				.set({ coverStage: 'COVER_APPROVED', coverApprovedAt: now, updatedAt: now })
				.where(eq(bookProjects.id, project.id));
			coverApproved = true;
		} else if (task.track === 'LAYOUT') {
			await tx
				.update(bookProjects)
				.set({ editorialStage: 'LAYOUT_APPROVED', layoutApprovedAt: now, updatedAt: now })
				.where(eq(bookProjects.id, project.id));
			layoutApproved = true;
		} else if (task.track === 'EDITORIAL') {
			/** Naskah selesai disunting → siap masuk tata letak. */
			await tx
				.update(bookProjects)
				.set({ editorialStage: 'LAYOUTING', updatedAt: now })
				.where(eq(bookProjects.id, project.id));
		} else if (task.track === 'PRINT') {
			await tx
				.update(bookProjects)
				.set({ printStage: 'ADDED_TO_WAREHOUSE', updatedAt: now })
				.where(eq(bookProjects.id, project.id));
		} else if (task.track === 'LEGAL') {
			await tx
				.update(bookProjects)
				.set({ legalStage: 'ISBN_ISSUED', updatedAt: now })
				.where(eq(bookProjects.id, project.id));
		}

		/** Track ISBN dibuka setelah cover & layout disetujui. */
		if (coverApproved && layoutApproved) {
			const [legalTask] = await tx
				.select({ id: productionTasks.id, isUnlocked: productionTasks.isUnlocked })
				.from(productionTasks)
				.where(
					and(eq(productionTasks.projectId, project.id), eq(productionTasks.track, 'LEGAL'))
				)
				.limit(1);

			if (legalTask && !legalTask.isUnlocked) {
				await tx
					.update(productionTasks)
					.set({ isUnlocked: true, updatedAt: now })
					.where(eq(productionTasks.id, legalTask.id));
				autoUnlocks.push('ISBN_TRACK');
			}

			await tx
				.update(bookProjects)
				.set({ status: 'READY_FOR_PRINT', updatedAt: now })
				.where(eq(bookProjects.id, project.id));
		}

		/** File resolusi tinggi: syaratnya lunas penuh + dua approval. */
		if (coverApproved && layoutApproved && order.isFullyPaid && !project.highResUnlocked) {
			await tx
				.update(bookProjects)
				.set({ highResUnlocked: true, updatedAt: now })
				.where(eq(bookProjects.id, project.id));
			autoUnlocks.push('HIGH_RES_FILES');
		}

		return {
			taskId: task.id,
			projectId: project.id,
			taskTitle: task.title,
			track: task.track,
			status: 'COMPLETED' as const,
			commissionCredited,
			payoutAmount: payout,
			projectAutoUnlocks: autoUnlocks
		};
	});
}

/* -------------------------------------------------------------------------- */
/*                          4. RECORD BOOK SALE                               */
/* -------------------------------------------------------------------------- */

export type RecordSaleResult = {
	saleId: string;
	saleNumber: string;
	projectId: string;
	quantity: number;
	channel: SalesChannel;
	grossAmount: string;
	netRoyalty: string;
	remainingStock: number;
	royaltyLedgerId: string;
	authorId: string;
};

/**
 * Mencatat penjualan buku: potong stok gudang + kredit royalti penulis.
 * Stok dikunci `FOR UPDATE` sehingga dua penjualan bersamaan tidak bisa
 * menjual unit yang sama.
 */
export async function recordBookSale(
	projectId: string,
	quantity: number,
	channel: SalesChannel,
	options: { unitPrice?: number; reference?: string; recordedBy?: string; soldAt?: Date } = {}
): Promise<RecordSaleResult> {
	const qty = Math.floor(quantity);
	if (!Number.isFinite(qty) || qty <= 0) {
		fail('INVALID_STATE', 'Jumlah penjualan harus lebih dari 0.');
	}

	return db.transaction(async (tx) => {
		const [stock] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.projectId, projectId))
			.for('update')
			.limit(1);
		if (!stock) fail('NOT_FOUND', 'Data inventori untuk proyek ini tidak ditemukan.');

		const available = stock.onHand - stock.reserved;
		if (available < qty) {
			fail(
				'INSUFFICIENT_STOCK',
				`Stok tidak mencukupi. Tersedia ${available} eksemplar, diminta ${qty}.`,
				{ available, requested: qty }
			);
		}

		const [project] = await tx
			.select({ id: bookProjects.id, orderId: bookProjects.orderId, title: bookProjects.title })
			.from(bookProjects)
			.where(eq(bookProjects.id, projectId))
			.limit(1);
		if (!project) fail('NOT_FOUND', 'Proyek buku tidak ditemukan.');

		const [order] = await tx
			.select({
				authorId: orders.authorId,
				authorRoyaltyPct: orders.authorRoyaltyPct
			})
			.from(orders)
			.where(eq(orders.id, project.orderId))
			.limit(1);
		if (!order) fail('NOT_FOUND', 'Order proyek tidak ditemukan.');

		const unitPrice = options.unitPrice ?? toNumber(stock.retailPrice);
		if (unitPrice <= 0) {
			fail('INVALID_STATE', 'Harga jual belum diset. Tentukan harga jual terlebih dahulu.');
		}

		const unitProductionCost = toNumber(stock.avgProductionCost);
		const royaltyPct = toNumber(order.authorRoyaltyPct);
		const grossAmount = unitPrice * qty;
		/** (Harga Jual - Biaya Produksi) × qty × Royalti% — tidak pernah negatif. */
		const netRoyalty = Math.max(0, rupiah((unitPrice - unitProductionCost) * qty * (royaltyPct / 100)));

		const saleNumber = await nextDocumentNumber(tx, 'SALE', options.soldAt ?? new Date());

		const [sale] = await tx
			.insert(bookSales)
			.values({
				saleNumber,
				projectId: project.id,
				quantity: qty,
				channel,
				unitPrice: toMoneyString(unitPrice),
				grossAmount: toMoneyString(grossAmount),
				unitProductionCost: toMoneyString(unitProductionCost),
				royaltyPct: toMoneyString(royaltyPct),
				netRoyalty: toMoneyString(netRoyalty),
				reference: options.reference,
				recordedBy: options.recordedBy,
				soldAt: options.soldAt ?? new Date()
			})
			.returning({ id: bookSales.id, saleNumber: bookSales.saleNumber });

		if (!sale) fail('INVALID_STATE', 'Gagal menyimpan transaksi penjualan.');

		await tx
			.update(inventory)
			.set({
				onHand: stock.onHand - qty,
				soldTotal: stock.soldTotal + qty,
				updatedAt: new Date()
			})
			.where(eq(inventory.id, stock.id));

		const [ledger] = await tx
			.insert(royaltyLedgers)
			.values({
				authorId: order.authorId,
				projectId: project.id,
				saleId: sale.id,
				entryType: 'ROYALTY',
				amount: toMoneyString(netRoyalty),
				status: 'AVAILABLE',
				description: `Royalti ${qty} eksemplar — ${sale.saleNumber}`,
				idempotencyKey: `sale:${sale.id}:royalty`
			})
			.returning({ id: royaltyLedgers.id });

		return {
			saleId: sale.id,
			saleNumber: sale.saleNumber,
			projectId: project.id,
			quantity: qty,
			channel,
			grossAmount: toMoneyString(grossAmount),
			netRoyalty: toMoneyString(netRoyalty),
			remainingStock: stock.onHand - qty,
			royaltyLedgerId: ledger!.id,
			authorId: order.authorId
		};
	});
}

/* -------------------------------------------------------------------------- */
/*                   5. TASK ASSIGNMENT (PM → FREELANCER)                     */
/* -------------------------------------------------------------------------- */

export async function assignProductionTask(params: {
	taskId: string;
	freelancerId: string;
	assignedBy: string;
	feeStructure: FeeStructure;
	flatFee?: number;
	perPageRate?: number;
	pageCount?: number;
	deadline?: string;
}): Promise<{ taskId: string; assigneeId: string; payoutAmount: string }> {
	return db.transaction(async (tx) => {
		const [task] = await tx
			.select()
			.from(productionTasks)
			.where(eq(productionTasks.id, params.taskId))
			.for('update')
			.limit(1);
		if (!task) fail('NOT_FOUND', 'Task produksi tidak ditemukan.');
		if (task.status === 'COMPLETED') {
			fail('INVALID_STATE', 'Task sudah selesai dan tidak dapat diubah lagi.');
		}

		const [freelancer] = await tx
			.select({ id: profiles.id, role: profiles.role, isActive: profiles.isActive })
			.from(profiles)
			.where(eq(profiles.id, params.freelancerId))
			.limit(1);
		if (!freelancer) fail('NOT_FOUND', 'Freelancer tidak ditemukan.');
		if (freelancer.role !== 'FREELANCER') {
			fail('INVALID_STATE', 'Pengguna yang dipilih bukan freelancer.');
		}
		if (!freelancer.isActive) fail('INVALID_STATE', 'Freelancer ini sedang tidak aktif.');

		const pageCount = params.pageCount ?? task.pageCount;
		const payout =
			params.feeStructure === 'PER_PAGE_RATE'
				? toMoneyString((params.perPageRate ?? 0) * pageCount)
				: toMoneyString(params.flatFee ?? 0);

		await tx
			.update(productionTasks)
			.set({
				assigneeId: params.freelancerId,
				assignedBy: params.assignedBy,
				assignedAt: new Date(),
				feeStructure: params.feeStructure,
				flatFee: toMoneyString(params.flatFee ?? 0),
				perPageRate: toMoneyString(params.perPageRate ?? 0),
				pageCount,
				payoutAmount: payout,
				status: 'IN_PROGRESS',
				deadline: params.deadline,
				updatedAt: new Date()
			})
			.where(eq(productionTasks.id, task.id));

		return { taskId: task.id, assigneeId: params.freelancerId, payoutAmount: payout };
	});
}

/* -------------------------------------------------------------------------- */
/*                    6. FREELANCER SUBMITS FOR REVIEW                        */
/* -------------------------------------------------------------------------- */

export async function submitTaskForReview(
	taskId: string,
	actorId: string
): Promise<{ taskId: string; status: 'WAITING_AUTHOR_REVIEW' }> {
	return db.transaction(async (tx) => {
		const [task] = await tx
			.select()
			.from(productionTasks)
			.where(eq(productionTasks.id, taskId))
			.for('update')
			.limit(1);
		if (!task) fail('NOT_FOUND', 'Task produksi tidak ditemukan.');
		if (!task.assigneeId) {
			fail('INVALID_STATE', 'Task belum memiliki freelancer yang ditugaskan.');
		}
		if (task.assigneeId !== actorId) {
			fail('FORBIDDEN', 'Hanya freelancer yang ditugaskan dapat mengirim hasil.');
		}
		if (task.status !== 'IN_PROGRESS') {
			fail('INVALID_STATE', 'Task tidak sedang dalam pengerjaan.');
		}

		const now = new Date();
		await tx
			.update(productionTasks)
			.set({ status: 'WAITING_AUTHOR_REVIEW', submittedAt: now, updatedAt: now })
			.where(eq(productionTasks.id, task.id));

		if (task.track === 'COVER') {
			await tx
				.update(bookProjects)
				.set({ coverStage: 'AUTHOR_REVIEW', updatedAt: now })
				.where(eq(bookProjects.id, task.projectId));
		} else if (task.track === 'LAYOUT' || task.track === 'EDITORIAL') {
			await tx
				.update(bookProjects)
				.set({ editorialStage: 'AUTHOR_REVIEW', updatedAt: now })
				.where(eq(bookProjects.id, task.projectId));
		}

		return { taskId: task.id, status: 'WAITING_AUTHOR_REVIEW' as const };
	});
}

/* -------------------------------------------------------------------------- */
/*                       7. PRINT RUN → WAREHOUSE                             */
/* -------------------------------------------------------------------------- */

export async function receivePrintRun(
	printRunId: string
): Promise<{ printRunId: string; addedUnits: number; onHand: number }> {
	return db.transaction(async (tx) => {
		const [run] = await tx
			.select()
			.from(printRuns)
			.where(eq(printRuns.id, printRunId))
			.for('update')
			.limit(1);
		if (!run) fail('NOT_FOUND', 'Print run tidak ditemukan.');
		if (run.stage === 'ADDED_TO_WAREHOUSE') {
			fail('ALREADY_PROCESSED', 'Print run ini sudah masuk gudang.');
		}

		const [stock] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.projectId, run.projectId))
			.for('update')
			.limit(1);
		if (!stock) fail('NOT_FOUND', 'Data inventori proyek tidak ditemukan.');

		/** Hanya eksemplar gudang yang dapat dijual; sisanya hak penulis. */
		const addedUnits = run.warehouseCopies;
		const newOnHand = stock.onHand + addedUnits;
		const totalValue =
			toNumber(stock.avgProductionCost) * stock.onHand +
			toNumber(run.costPerUnit) * addedUnits;
		const avgCost = newOnHand > 0 ? rupiah(totalValue / newOnHand) : 0;

		await tx
			.update(printRuns)
			.set({ stage: 'ADDED_TO_WAREHOUSE', updatedAt: new Date() })
			.where(eq(printRuns.id, run.id));

		await tx
			.update(inventory)
			.set({
				onHand: newOnHand,
				avgProductionCost: toMoneyString(avgCost),
				updatedAt: new Date()
			})
			.where(eq(inventory.id, stock.id));

		await tx
			.update(bookProjects)
			.set({ printStage: 'ADDED_TO_WAREHOUSE', updatedAt: new Date() })
			.where(eq(bookProjects.id, run.projectId));

		return { printRunId: run.id, addedUnits, onHand: newOnHand };
	});
}

/* -------------------------------------------------------------------------- */
/*                         8. WALLETS & WITHDRAWALS                           */
/* -------------------------------------------------------------------------- */

export type WalletSummary = {
	userId: string;
	wallet: 'FREELANCER' | 'ROYALTY';
	available: string;
	pending: string;
	withdrawn: string;
	entryCount: number;
};

/** Saldo dihitung dari ledger berjalan (bukan kolom cache) agar selalu akurat. */
export async function getWalletSummary(
	userId: string,
	wallet: 'FREELANCER' | 'ROYALTY',
	executor: Tx | typeof db = db
): Promise<WalletSummary> {
	const rows =
		wallet === 'FREELANCER'
			? await executor
					.select({ amount: freelancerLedgers.amount, status: freelancerLedgers.status })
					.from(freelancerLedgers)
					.where(eq(freelancerLedgers.freelancerId, userId))
			: await executor
					.select({ amount: royaltyLedgers.amount, status: royaltyLedgers.status })
					.from(royaltyLedgers)
					.where(eq(royaltyLedgers.authorId, userId));

	const active = rows.filter((r) => r.status !== 'CANCELLED');

	/** Saldo yang benar-benar bisa ditarik. */
	const available = active
		.filter((r) => r.status === 'AVAILABLE')
		.reduce((acc, r) => acc + toNumber(r.amount), 0);

	/** Komisi/royalti yang belum dirilis (positif). */
	const pending = active
		.filter((r) => r.status === 'PENDING' && toNumber(r.amount) > 0)
		.reduce((acc, r) => acc + toNumber(r.amount), 0);

	/** Total yang sudah ditarik (entri negatif berstatus WITHDRAWN). */
	const withdrawn = active
		.filter((r) => r.status === 'WITHDRAWN')
		.reduce((acc, r) => acc + Math.abs(toNumber(r.amount)), 0);

	return {
		userId,
		wallet,
		available: toMoneyString(available),
		pending: toMoneyString(pending),
		withdrawn: toMoneyString(withdrawn),
		entryCount: rows.length
	};
}

/** Pengajuan penarikan saldo (freelancer maupun royalti penulis). */
export async function requestWithdrawal(params: {
	userId: string;
	wallet: 'FREELANCER' | 'ROYALTY';
	amount: number;
	bankName?: string;
	bankAccountName?: string;
	bankAccountNumber?: string;
}): Promise<{ withdrawalId: string; amount: string }> {
	const amount = rupiah(params.amount);
	if (amount <= 0) fail('INVALID_STATE', 'Nominal penarikan harus lebih dari 0.');

	/* Minimum dari pengaturan, bukan konstanta — finance dapat menyesuaikannya. */
	const { minimumAmount } = await getWithdrawalSettings();
	if (minimumAmount > 0 && amount < minimumAmount) {
		fail(
			'INVALID_STATE',
			`Minimum penarikan ${rupiah(minimumAmount).toLocaleString('id-ID')} rupiah.`,
			{ minimumAmount }
		);
	}

	return db.transaction(async (tx) => {
		const summary = await getWalletSummary(params.userId, params.wallet, tx);
		if (toNumber(summary.available) < amount) {
			fail('INVALID_STATE', 'Saldo tersedia tidak mencukupi untuk penarikan ini.', {
				available: summary.available,
				requested: amount
			});
		}

		const [request] = await tx
			.insert(withdrawalRequests)
			.values({
				userId: params.userId,
				wallet: params.wallet,
				amount: toMoneyString(amount),
				status: 'REQUESTED',
				bankName: params.bankName,
				bankAccountName: params.bankAccountName,
				bankAccountNumber: params.bankAccountNumber
			})
			.returning({ id: withdrawalRequests.id });

		/** Entri negatif berstatus PENDING langsung mengurangi saldo tersedia. */
		if (params.wallet === 'FREELANCER') {
			await tx.insert(freelancerLedgers).values({
				freelancerId: params.userId,
				entryType: 'WITHDRAWAL',
				amount: toMoneyString(-amount),
				status: 'PENDING',
				description: `Penarikan diajukan (${request!.id.slice(0, 8)})`
			});
		} else {
			await tx.insert(royaltyLedgers).values({
				authorId: params.userId,
				entryType: 'WITHDRAWAL',
				amount: toMoneyString(-amount),
				status: 'PENDING',
				description: `Penarikan diajukan (${request!.id.slice(0, 8)})`
			});
		}

		return { withdrawalId: request!.id, amount: toMoneyString(amount) };
	});
}

/** Finance menyetujui / membayar / menolak penarikan. */
export async function processWithdrawal(params: {
	withdrawalId: string;
	action: 'APPROVE' | 'PAY' | 'REJECT';
	processedBy: string;
	note?: string;
}): Promise<{ withdrawalId: string; status: string }> {
	const statusMap = {
		APPROVE: 'APPROVED',
		PAY: 'PAID',
		REJECT: 'REJECTED'
	} as const;

	return db.transaction(async (tx) => {
		const [request] = await tx
			.select()
			.from(withdrawalRequests)
			.where(eq(withdrawalRequests.id, params.withdrawalId))
			.for('update')
			.limit(1);
		if (!request) fail('NOT_FOUND', 'Permintaan penarikan tidak ditemukan.');
		if (request.status === 'PAID' || request.status === 'REJECTED') {
			fail('ALREADY_PROCESSED', 'Permintaan penarikan ini sudah diproses.');
		}

		const nextStatus = statusMap[params.action];

		await tx
			.update(withdrawalRequests)
			.set({
				status: nextStatus,
				processedBy: params.processedBy,
				processedAt: new Date(),
				note: params.note
			})
			.where(eq(withdrawalRequests.id, request.id));

		const ledgerStatus =
			params.action === 'REJECT' ? 'CANCELLED' : params.action === 'PAY' ? 'WITHDRAWN' : 'PENDING';

		if (request.wallet === 'FREELANCER') {
			await tx
				.update(freelancerLedgers)
				.set({ status: ledgerStatus })
				.where(
					and(
						eq(freelancerLedgers.freelancerId, request.userId),
						eq(freelancerLedgers.entryType, 'WITHDRAWAL'),
						eq(freelancerLedgers.status, 'PENDING')
					)
				);
		} else {
			await tx
				.update(royaltyLedgers)
				.set({ status: ledgerStatus })
				.where(
					and(
						eq(royaltyLedgers.authorId, request.userId),
						eq(royaltyLedgers.entryType, 'WITHDRAWAL'),
						eq(royaltyLedgers.status, 'PENDING')
					)
				);
		}

		return { withdrawalId: request.id, status: nextStatus };
	});
}

/* -------------------------------------------------------------------------- */
/*                       9. PRINT RUN CREATION (HPP)                          */
/* -------------------------------------------------------------------------- */

export async function createPrintRun(params: {
	projectId: string;
	quantity: number;
	authorCopies: number;
}): Promise<{ printRunId: string; costPerUnit: string; totalCost: string }> {
	const { calculatePrintCost } = await import('./printing');

	return db.transaction(async (tx) => {
		const [project] = await tx
			.select()
			.from(bookProjects)
			.where(eq(bookProjects.id, params.projectId))
			.for('update')
			.limit(1);
		if (!project) fail('NOT_FOUND', 'Proyek buku tidak ditemukan.');
		if (project.pageCount <= 0) {
			fail('INVALID_STATE', 'Jumlah halaman belum diisi, HPP cetak tidak dapat dihitung.');
		}

		const cost = await calculatePrintCost({
			pageCount: project.pageCount,
			paperType: project.paperType,
			bookSize: project.bookSize,
			binding: project.binding,
			lamination: project.lamination,
			isFullColor: project.isFullColor,
			quantity: params.quantity
		});

		const quantity = Math.max(1, Math.floor(params.quantity));
		const authorCopies = Math.min(quantity, Math.max(0, Math.floor(params.authorCopies)));

		const [run] = await tx
			.insert(printRuns)
			.values({
				projectId: project.id,
				quantity,
				costPerUnit: cost.costPerUnit,
				totalCost: cost.totalCost,
				pageCount: project.pageCount,
				paperType: project.paperType,
				bookSize: project.bookSize,
				binding: project.binding,
				lamination: project.lamination,
				stage: 'PRINT_QUEUE',
				authorCopies,
				warehouseCopies: quantity - authorCopies
			})
			.returning({ id: printRuns.id });

		await tx
			.update(bookProjects)
			.set({ printStage: 'PRINT_QUEUE', status: 'IN_PRINTING', updatedAt: new Date() })
			.where(eq(bookProjects.id, project.id));

		return {
			printRunId: run!.id,
			costPerUnit: cost.costPerUnit,
			totalCost: cost.totalCost
		};
	});
}

export { ErpError };
