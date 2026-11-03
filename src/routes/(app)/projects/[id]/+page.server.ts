import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	bookSales,
	fileAssets,
	inventory,
	invoicePayments,
	invoices,
	orders,
	packages,
	printRuns,
	productionTasks,
	profiles,
	revisions
} from '$db/schema';
import {
	approveProductionTask,
	assignProductionTask,
	createPrintRun,
	handleInvoicePaid,
	recordBookSale
} from '$lib/server/services/erpEngine';
import { readRequestId, runIdempotent } from '$lib/server/services/idempotency';
import { audit, diff } from '$lib/server/services/auditDraft';
import { addComment, canSeeInternal, commentsByTask } from '$lib/server/services/comments';
import { notifyComment } from '$lib/server/services/notifications';
import { assetDownloadUrl, uploadProjectFile } from '$lib/server/services/fileUpload';
import { ErpError } from '$lib/server/services/erpErrors';
import { toMoneyString } from '$lib/server/services/money';
import type { Actions, PageServerLoad } from './$types';

const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;
const PM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ID yang bukan UUID akan ditolak Postgres (22P02) dan berujung 500.
 * Kita ubah menjadi 404 supaya tautan yang salah ketik tampil sebagai
 * "halaman tidak ditemukan", bukan "server bermasalah".
 */
function assertProjectId(id: string) {
	if (!UUID_RE.test(id)) error(404, 'Proyek buku tidak ditemukan.');
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const role = locals.profile?.role;
	if (!role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
		error(403, 'Akses ditolak.');
	}

	assertProjectId(params.id);

	const [project] = await db
		.select({
			id: bookProjects.id,
			title: bookProjects.title,
			subtitle: bookProjects.subtitle,
			authorName: bookProjects.authorName,
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
			version: bookProjects.version,
			createdAt: bookProjects.createdAt,
			orderId: orders.id,
			orderNumber: orders.orderNumber,
			orderStatus: orders.status,
			totalAmount: orders.totalAmount,
			paidAmount: orders.paidAmount,
			isFullyPaid: orders.isFullyPaid,
			authorRoyaltyPct: orders.authorRoyaltyPct,
			maxCoverRevisions: orders.maxCoverRevisions,
			maxLayoutRevisions: orders.maxLayoutRevisions,
			packageName: packages.name,
			authorId: orders.authorId,
			authorEmail: profiles.email
		})
		.from(bookProjects)
		.innerJoin(orders, eq(orders.id, bookProjects.orderId))
		.innerJoin(packages, eq(packages.id, orders.packageId))
		.leftJoin(profiles, eq(profiles.id, orders.authorId))
		.where(eq(bookProjects.id, params.id))
		.limit(1);

	if (!project) error(404, 'Proyek buku tidak ditemukan.');

	const tasks = await db
		.select({
			id: productionTasks.id,
			track: productionTasks.track,
			stage: productionTasks.stage,
			title: productionTasks.title,
			description: productionTasks.description,
			status: productionTasks.status,
			assigneeId: productionTasks.assigneeId,
			assigneeName: profiles.fullName,
			assigneeSpecialty: profiles.specialty,
			feeStructure: productionTasks.feeStructure,
			flatFee: productionTasks.flatFee,
			perPageRate: productionTasks.perPageRate,
			pageCount: productionTasks.pageCount,
			payoutAmount: productionTasks.payoutAmount,
			isCommissionCredited: productionTasks.isCommissionCredited,
			revisionCount: productionTasks.revisionCount,
			maxRevisions: productionTasks.maxRevisions,
			extraRevisionFee: productionTasks.extraRevisionFee,
			isUnlocked: productionTasks.isUnlocked,
			deadline: productionTasks.deadline,
			submittedAt: productionTasks.submittedAt,
			approvedAt: productionTasks.approvedAt
		})
		.from(productionTasks)
		.leftJoin(profiles, eq(profiles.id, productionTasks.assigneeId))
		.where(eq(productionTasks.projectId, project.id))
		.orderBy(asc(productionTasks.track));

	const orderInvoices = await db
		.select()
		.from(invoices)
		.where(eq(invoices.orderId, project.orderId))
		.orderBy(asc(invoices.createdAt));

	const taskIds = tasks.map((t) => t.id);

	const projectRevisions = taskIds.length
		? await db
				.select({
					id: revisions.id,
					taskId: revisions.taskId,
					revisionNo: revisions.revisionNo,
					notes: revisions.notes,
					isChargeable: revisions.isChargeable,
					status: revisions.status,
					createdAt: revisions.createdAt,
					requestedByName: profiles.fullName
				})
				.from(revisions)
				.leftJoin(profiles, eq(profiles.id, revisions.requestedBy))
				.where(eq(revisions.projectId, project.id))
				.orderBy(desc(revisions.createdAt))
		: [];

	const assetRows = await db
		.select({
			id: fileAssets.id,
			kind: fileAssets.kind,
			storageProvider: fileAssets.storageProvider,
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
		.where(eq(fileAssets.projectId, project.id))
		.orderBy(desc(fileAssets.createdAt));

	/* Tautan unduh disiapkan di server: signed URL berumur pendek, atau route lokal. */
	const assets = await Promise.all(
		assetRows.map(async (row) => ({
			...row,
			url: await assetDownloadUrl({ ...row, highResUnlocked: project.highResUnlocked })
		}))
	);
	const freelancers = await db
		.select({
			id: profiles.id,
			fullName: profiles.fullName,
			specialty: profiles.specialty
		})
		.from(profiles)
		.where(and(eq(profiles.role, 'FREELANCER'), eq(profiles.isActive, true)))
		.orderBy(asc(profiles.fullName));

	const [stock] = await db
		.select()
		.from(inventory)
		.where(eq(inventory.projectId, project.id))
		.limit(1);

	const runs = await db
		.select()
		.from(printRuns)
		.where(eq(printRuns.projectId, project.id))
		.orderBy(desc(printRuns.createdAt));

	const sales = await db
		.select()
		.from(bookSales)
		.where(eq(bookSales.projectId, project.id))
		.orderBy(desc(bookSales.soldAt))
		.limit(20);

	const payments = orderInvoices.length
		? await db
				.select()
				.from(invoicePayments)
				.where(inArray(invoicePayments.invoiceId, orderInvoices.map((i) => i.id)))
				.orderBy(desc(invoicePayments.paidAt))
		: [];

	const staff = canSeeInternal(locals.profile!.role);
	const commentMap = await commentsByTask(taskIds, staff);

	return {
		project,
		tasks: tasks.map((task) => ({ ...task, comments: commentMap.get(task.id) ?? [] })),
		invoices: orderInvoices,
		payments,
		revisions: projectRevisions,
		assets,
		freelancers,
		inventory: stock ?? null,
		printRuns: runs,
		sales,
		canComment: true,
		canInternal: staff,
		canManage: PM_ROLES.includes(locals.profile!.role as (typeof PM_ROLES)[number]),
		canPay: true
	};
};

/** Menerjemahkan error domain ERP menjadi pesan form yang ramah. */
function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

export const actions: Actions = {
	/** Finance memverifikasi transfer → engine membuka tahap berikutnya. */
	'pay-invoice': async ({ request, params, locals }) => {
		const role = locals.profile?.role;
		if (!role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat memverifikasi pembayaran.' });
		}
		const form = await request.formData();
		const invoiceId = String(form.get('invoiceId') ?? '');
		if (!invoiceId) return fail(400, { message: 'Invoice tidak dipilih.' });

		try {
			const { value: result, replayed } = await runIdempotent({
				scope: 'invoice.pay',
				actorId: locals.profile!.id,
				requestId: readRequestId(form),
				work: () => handleInvoicePaid(invoiceId),
				serialize: (value) => ({ ...value })
			});

			if (!replayed && !result.alreadyPaid) {
				await audit({
					actor: locals.profile,
					action: 'invoice.paid',
					entityType: 'invoice',
					entityId: invoiceId,
					summary: `Memverifikasi pembayaran ${result.invoiceNumber} dari halaman proyek.`,
					context: { invoiceNumber: result.invoiceNumber, projectId: result.projectId ?? params.id },
					requestId: readRequestId(form)
				});
			}

			return {
				ok: true,
				replayed,
				message: result.alreadyPaid
					? `Invoice ${result.invoiceNumber} sudah lunas sebelumnya.`
					: `Pembayaran ${result.invoiceNumber} terverifikasi. Tahap terbuka: ${result.unlocked.join(', ') || '—'}`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** PM menugaskan freelancer beserta struktur fee. */
	'assign-task': async ({ request, locals }) => {
		const role = locals.profile?.role;
		if (!role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat menugaskan pekerjaan.' });
		}
		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		const freelancerId = String(form.get('freelancerId') ?? '');
		const feeStructure = String(form.get('feeStructure') ?? 'FLAT_FEE') as 'FLAT_FEE' | 'PER_PAGE_RATE';
		const flatFee = Number(form.get('flatFee') ?? 0);
		const perPageRate = Number(form.get('perPageRate') ?? 0);
		const deadline = String(form.get('deadline') ?? '');

		if (!taskId || !freelancerId) {
			return fail(400, { message: 'Pilih task dan freelancer terlebih dahulu.' });
		}
		if (feeStructure === 'FLAT_FEE' && flatFee <= 0) {
			return fail(400, { message: 'Fee flat harus lebih dari 0.' });
		}
		if (feeStructure === 'PER_PAGE_RATE' && perPageRate <= 0) {
			return fail(400, { message: 'Tarif per halaman harus lebih dari 0.' });
		}

		try {
			/* Menugaskan dua kali akan me-reset status task; kunci per task mencegahnya. */
			const { value: result } = await runIdempotent({
				scope: `task.assign:${taskId}`,
				actorId: locals.profile!.id,
				requestId: readRequestId(form),
				work: () =>
					assignProductionTask({
						taskId,
						freelancerId,
						assignedBy: locals.profile!.id,
						feeStructure,
						flatFee: feeStructure === 'FLAT_FEE' ? flatFee : undefined,
						perPageRate: feeStructure === 'PER_PAGE_RATE' ? perPageRate : undefined,
						deadline: deadline || undefined
					}),
				serialize: (value) => ({ ...value })
			});

			const [taskInfo] = await db
				.select({ projectId: productionTasks.projectId })
				.from(productionTasks)
				.where(eq(productionTasks.id, taskId))
				.limit(1);

			const [assignee] = await db
				.select({ fullName: profiles.fullName })
				.from(profiles)
				.where(eq(profiles.id, freelancerId))
				.limit(1);

			await audit({
				actor: locals.profile,
				action: 'task.assigned',
				entityType: 'task',
				entityId: taskId,
				summary: `Menugaskan ${assignee?.fullName ?? 'freelancer'} dengan fee ${feeStructure === 'FLAT_FEE' ? 'flat' : 'per halaman'} ${toMoneyString(Number(result.payoutAmount))}.`,
				context: { freelancerId, feeStructure, projectId: taskInfo?.projectId ?? null },
				requestId: readRequestId(form)
			});

			return { ok: true, message: `Task ditugaskan. Fee dihitung: Rp ${result.payoutAmount}` };
		} catch (e) {
			return toFailure(e);
		}
	},

	/**
	 * Spesifikasi cetak & metadata buku.
	 *
	 * Penjaga konkurensi: form membawa `version` yang dibacanya. UPDATE hanya
	 * mengenai baris bila versi di database masih sama — dua PM yang membuka
	 * halaman bersamaan tidak bisa saling menimpa tanpa sadar. Yang kalah
	 * menerima 409 beserta versi terbaru, dan tidak ada perubahan yang hilang
	 * diam-diam.
	 */
	'save-specs': async ({ request, params, locals }) => {
		const role = locals.profile?.role;
		if (!role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah spesifikasi.' });
		}
		const form = await request.formData();
		const pageCount = Number(form.get('pageCount') ?? 0);
		const paperType = String(form.get('paperType') ?? 'BOOKPAPER');
		const bookSize = String(form.get('bookSize') ?? 'A5');
		const binding = String(form.get('binding') ?? 'PERFECT_BINDING');
		const lamination = String(form.get('lamination') ?? 'DOFF');
		const isFullColor = form.get('isFullColor') === 'on';
		const genre = String(form.get('genre') ?? '').trim() || null;
		const isbn = String(form.get('isbn') ?? '').trim() || null;
		const expectedVersion = Number(form.get('version') ?? 0);

		if (!Number.isFinite(pageCount) || pageCount < 8) {
			return fail(400, { message: 'Jumlah halaman minimal 8.' });
		}
		if (!Number.isFinite(expectedVersion) || expectedVersion < 1) {
			return fail(
				400,
				{ message: 'Formulir kedaluwarsa. Muat ulang halaman lalu simpan lagi.' }
			);
		}

		try {
			/* Dibaca lebih dulu untuk menyusun diff audit dan pesan konflik. */
			const [before] = await db
				.select({
					version: bookProjects.version,
					pageCount: bookProjects.pageCount,
					paperType: bookProjects.paperType,
					bookSize: bookProjects.bookSize,
					binding: bookProjects.binding,
					lamination: bookProjects.lamination,
					isFullColor: bookProjects.isFullColor,
					genre: bookProjects.genre,
					isbn: bookProjects.isbn
				})
				.from(bookProjects)
				.where(eq(bookProjects.id, params.id))
				.limit(1);

			if (!before) return fail(404, { message: 'Proyek buku tidak ditemukan.' });

			const updated = await db
				.update(bookProjects)
				.set({
					pageCount: Math.floor(pageCount),
					paperType: paperType as 'BOOKPAPER' | 'HVS' | 'ART_PAPER',
					bookSize: bookSize as 'A5' | 'B5' | 'UNESCO' | 'A4' | 'CUSTOM',
					binding: binding as 'PERFECT_BINDING' | 'SPIRAL' | 'HARDCOVER' | 'STAPLE',
					lamination: lamination as 'NONE' | 'DOFF' | 'GLOSSY',
					isFullColor,
					genre,
					...(isbn ? { isbn } : {}),
					version: sql`${bookProjects.version} + 1`,
					updatedAt: new Date()
				})
				/* Syarat versi ada di WHERE, bukan di aplikasi: cek-lalu-tulis
				 * terpisah tetap bisa balapan antara dua request. */
				.where(and(eq(bookProjects.id, params.id), eq(bookProjects.version, expectedVersion)))
				.returning({ version: bookProjects.version });

			if (updated.length === 0) {
				return fail(409, {
					message:
						'Spesifikasi ini sudah diubah orang lain sejak halaman Anda dibuka. Muat ulang untuk melihat versi terbaru, lalu ulangi perubahan Anda.',
					conflict: true,
					currentVersion: before.version
				});
			}

			const changes = diff(
				{
					pageCount: before.pageCount,
					paperType: before.paperType,
					bookSize: before.bookSize,
					binding: before.binding,
					lamination: before.lamination,
					isFullColor: before.isFullColor,
					genre: before.genre,
					isbn: before.isbn
				},
				{
					pageCount: Math.floor(pageCount),
					paperType: paperType as 'BOOKPAPER' | 'HVS' | 'ART_PAPER',
					bookSize: bookSize as 'A5' | 'B5' | 'UNESCO' | 'A4' | 'CUSTOM',
					binding: binding as 'PERFECT_BINDING' | 'SPIRAL' | 'HARDCOVER' | 'STAPLE',
					lamination: lamination as 'NONE' | 'DOFF' | 'GLOSSY',
					isFullColor,
					genre,
					/* ISBN sengaja tidak diubah bila form mengosongkannya: hanya
					   nilai yang benar-benar ditulis ke database yang masuk diff,
					   supaya jejak audit tidak melaporkan perubahan yang tak terjadi. */
					...(isbn ? { isbn } : {})
				}
			);

			if (changes) {
				await audit({
					actor: locals.profile,
					action: 'project.specs_updated',
					entityType: 'project',
					entityId: params.id,
					summary: `Mengubah spesifikasi cetak: ${Object.keys(changes).join(', ')}.`,
					changes,
					context: { version: updated[0]?.version ?? expectedVersion + 1 }
				});
			}

			/** Fee per halaman perlu dihitung ulang setelah jumlah halaman berubah. */
			await db
				.update(productionTasks)
				.set({ pageCount: Math.floor(pageCount) })
				.where(
					and(
						eq(productionTasks.projectId, params.id),
						eq(productionTasks.feeStructure, 'PER_PAGE_RATE'),
						sql`${productionTasks.isCommissionCredited} = false`
					)
				);

			return {
				ok: true,
				message: changes
					? 'Spesifikasi buku disimpan.'
					: 'Tidak ada perubahan pada spesifikasi.',
				version: updated[0]?.version
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Antrean cetak baru berdasarkan spesifikasi + HPP. */
	'create-print-run': async ({ request, params, locals }) => {
		const role = locals.profile?.role;
		if (!role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
			return fail(403, { message: 'Hanya Project Manager yang dapat membuat order cetak.' });
		}
		const form = await request.formData();
		const quantity = Number(form.get('quantity') ?? 0);
		const authorCopies = Number(form.get('authorCopies') ?? 0);

		if (!Number.isFinite(quantity) || quantity < 1) {
			return fail(400, { message: 'Jumlah cetak minimal 1 eksemplar.' });
		}
		if (authorCopies > quantity) {
			return fail(400, { message: 'Eksemplar penulis tidak boleh melebihi total cetak.' });
		}

		try {
			const { value: result } = await runIdempotent({
				scope: 'printrun.create',
				actorId: locals.profile!.id,
				requestId: readRequestId(form),
				work: () => createPrintRun({ projectId: params.id, quantity, authorCopies }),
				serialize: (value) => ({ ...value })
			});

			await audit({
				actor: locals.profile,
				action: 'print_run.created',
				entityType: 'print_run',
				entityId: result.printRunId,
				summary: `Membuat order cetak ${quantity} eksemplar — ${toMoneyString(Number(result.costPerUnit))}/eksemplar, total ${toMoneyString(Number(result.totalCost))}.`,
				context: { projectId: params.id, quantity, authorCopies },
				requestId: readRequestId(form)
			});

			return {
				ok: true,
				message: `Order cetak dibuat. HPP Rp ${result.costPerUnit}/eksemplar, total Rp ${result.totalCost}.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Catat penjualan → stok berkurang & royalti penulis dikreditkan. */
	'record-sale': async ({ request, params, locals }) => {
		const role = locals.profile?.role;
		if (!role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
			return fail(403, { message: 'Akses ditolak.' });
		}
		const form = await request.formData();
		const quantity = Number(form.get('quantity') ?? 0);
		const channel = String(form.get('channel') ?? 'DIRECT_WEB') as
			| 'DIRECT_WEB'
			| 'MARKETPLACE'
			| 'RESELLER'
			| 'EVENT';
		const unitPriceRaw = String(form.get('unitPrice') ?? '').trim();
		const reference = String(form.get('reference') ?? '').trim() || undefined;

		if (!Number.isFinite(quantity) || quantity < 1) {
			return fail(400, { message: 'Jumlah penjualan minimal 1.' });
		}

		try {
			/*
			 * Penjualan memotong stok dan mengkreditkan royalti. POST ganda harus
			 * berhenti di kunci ini, bukan di stok yang kebetulan habis.
			 */
			const { value: result } = await runIdempotent({
				scope: 'sale.record',
				actorId: locals.profile!.id,
				requestId: readRequestId(form),
				work: () =>
					recordBookSale(params.id, quantity, channel, {
						unitPrice: unitPriceRaw ? Number(unitPriceRaw) : undefined,
						reference,
						recordedBy: locals.profile!.id
					}),
				serialize: (value) => ({ ...value })
			});

			await audit({
				actor: locals.profile,
				action: 'sale.recorded',
				entityType: 'sale',
				entityId: result.saleId,
				summary: `Mencatat penjualan ${quantity} eksemplar (${channel}) — ${toMoneyString(Number(result.grossAmount))}. Royalti penulis ${toMoneyString(Number(result.netRoyalty))}.`,
				context: { projectId: params.id, quantity, channel, saleNumber: result.saleNumber },
				requestId: readRequestId(form)
			});

			return {
				ok: true,
				message: `Penjualan ${result.saleNumber} tercatat. Royalti penulis Rp ${result.netRoyalty}.`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** PM menyetujui atas nama penulis (mis. approval lewat komunikasi manual). */	'approve-on-behalf': async ({ request, params, locals }) => {
		const role = locals.profile?.role;
		if (role !== 'SUPER_ADMIN') {
			return fail(403, { message: 'Hanya Super Admin yang dapat menyetujui atas nama penulis.' });
		}
		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		const authorId = String(form.get('authorId') ?? '') || locals.profile!.id;

		try {
			const { value: result, replayed } = await runIdempotent({
				scope: `task.approve:${taskId}`,
				actorId: locals.profile!.id,
				requestId: readRequestId(form),
				work: () => approveProductionTask(taskId, authorId),
				serialize: (value) => ({ ...value })
			});

			if (!replayed) {
				await audit({
					actor: locals.profile,
					action: 'task.approved_on_behalf',
					entityType: 'task',
					entityId: taskId,
					summary: `Menyetujui "${result.taskTitle}" atas nama penulis${result.commissionCredited ? `. Komisi ${toMoneyString(Number(result.payoutAmount))} masuk ke dompet freelancer.` : '.'}`,
					context: { projectId: result.projectId, authorId, onBehalf: true },
					requestId: readRequestId(form)
				});
			}

			return {
				ok: true,
				replayed,
				message: replayed
					? 'Task ini sudah disetujui sebelumnya. Tidak ada perubahan baru.'
					: result.commissionCredited
						? `Task disetujui. Komisi Rp ${result.payoutAmount} masuk ke dompet freelancer.`
						: 'Task disetujui.'
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/**
	 * Unggah berkas proyek.
	 *
	 * Berkas masuk ke penyimpanan (Supabase bila dikonfigurasi, disk lokal saat
	 * pengembangan) lalu dicatat sebagai `file_assets`. Jenis berkas menentukan
	 * batas ukuran, MIME yang diterima, dan apakah aset termasuk master (terkunci
	 * sampai pelunasan).
	 */
	upload: async ({ request, params, locals }) => {
		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
			return fail(403, { message: 'Hanya tim internal yang dapat mengunggah berkas proyek.' });
		}

		const form = await request.formData();
		const kind = String(form.get('kind') ?? 'MANUSCRIPT');
		const file = form.get('file');

		if (!(file instanceof File)) {
			return fail(400, { message: 'Pilih berkas yang akan diunggah.' });
		}

		try {
			const result = await uploadProjectFile({
				projectId: params.id,
				kind: kind as never,
				file,
				uploadedBy: profile.id
			});

			await audit({
				actor: profile,
				action: 'file.uploaded',
				entityType: 'file',
				entityId: result.assetId,
				summary: `Mengunggah ${result.fileName} (${kind}) ke proyek.`,
				context: { projectId: params.id, kind, sizeBytes: result.sizeBytes }
			});

			return {
				ok: true,
				message: `${result.fileName} terunggah (${(result.sizeBytes / 1024).toFixed(0)} KB).`
			};
		} catch (e) {
			return toFailure(e);
		}
	},

	/** Komentar pada task — benang diskusi revisi. */
	comment: async ({ request, params, locals }) => {		const profile = locals.profile;
		const role = profile?.role;
		if (!profile || !role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
			return fail(403, { message: 'Akses ditolak.' });
		}

		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		const body = String(form.get('body') ?? '').trim();
		const isInternal = form.get('isInternal') === 'on';

		if (!taskId) return fail(400, { message: 'Task tidak dipilih.' });
		if (body.length < 2) return fail(400, { message: 'Komentar terlalu pendek.' });
		if (body.length > 2000) return fail(400, { message: 'Komentar maksimal 2000 karakter.' });

		/* Task harus milik proyek di URL — mencegah komentar nyasar antar proyek. */
		const [task] = await db
			.select({
				id: productionTasks.id,
				title: productionTasks.title,
				projectTitle: bookProjects.title
			})
			.from(productionTasks)
			.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
			.where(and(eq(productionTasks.id, taskId), eq(productionTasks.projectId, params.id)))
			.limit(1);

		if (!task) return fail(404, { message: 'Task tidak ditemukan pada proyek ini.' });

		try {
			const comment = await addComment({
				taskId,
				projectId: params.id,
				author: profile,
				body,
				isInternal
			});

			/* Pihak lain yang terlibat perlu tahu ada balasan baru. */
			await notifyComment({
				commentId: comment.id,
				taskId,
				taskTitle: task.title,
				projectTitle: task.projectTitle,
				authorName: profile.fullName,
				authorId: profile.id,
				isInternal: comment.isInternal,
				staffOnlyHref: `/projects/${params.id}`
			});

			return {
				ok: true,
				message: isInternal
					? 'Catatan internal ditambahkan (tidak terlihat penulis).'
					: 'Komentar ditambahkan ke diskusi task.',
				comment
			};
		} catch (e) {
			return toFailure(e);
		}
	}
};
