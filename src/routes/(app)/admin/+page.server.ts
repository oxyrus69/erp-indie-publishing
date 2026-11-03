import { desc, eq, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	freelancerLedgers,
	invoices,
	orders,
	packages,
	productionTasks,
	profiles,
	royaltyLedgers,
	withdrawalRequests
} from '$db/schema';
import { toNumber } from '$lib/server/services/money';
import { loadAnalytics } from '$lib/server/services/analytics';
import { authorsNeedingAttention } from '$lib/server/services/authors';
import type { PageServerLoad } from './$types';

/**
 * Dasbor operasional.
 * Angka diambil dari sumber kebenaran (invoice, ledger, task) — bukan kolom
 * cache — supaya tidak pernah berbeda dengan halaman detail proyek.
 */
export const load: PageServerLoad = async () => {
	const [projectRows, invoiceRows, taskRows, withdrawalRows, freelancerRows, balances, royaltyRows] =
		await Promise.all([
			db
				.select({
					id: bookProjects.id,
					title: bookProjects.title,
					authorName: bookProjects.authorName,
					status: bookProjects.status,
					editorialStage: bookProjects.editorialStage,
					coverStage: bookProjects.coverStage,
					legalStage: bookProjects.legalStage,
					printStage: bookProjects.printStage,
					updatedAt: bookProjects.updatedAt,
					orderNumber: orders.orderNumber,
					totalAmount: orders.totalAmount,
					isFullyPaid: orders.isFullyPaid,
					packageName: packages.name,
					orderCreatedAt: orders.createdAt
				})
				.from(bookProjects)
				.innerJoin(orders, eq(orders.id, bookProjects.orderId))
				.innerJoin(packages, eq(packages.id, orders.packageId))
				.orderBy(desc(orders.createdAt)),

			db
				.select({
					id: invoices.id,
					invoiceNumber: invoices.invoiceNumber,
					kind: invoices.kind,
					status: invoices.status,
					amount: invoices.amount,
					paidAmount: invoices.paidAmount,
					dueDate: invoices.dueDate,
					orderNumber: orders.orderNumber,
					projectId: bookProjects.id,
					projectTitle: bookProjects.title
				})
				.from(invoices)
				.innerJoin(orders, eq(orders.id, invoices.orderId))
				.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
				.orderBy(desc(invoices.createdAt)),

			db
				.select({
					id: productionTasks.id,
					status: productionTasks.status,
					track: productionTasks.track,
					deadline: productionTasks.deadline
				})
				.from(productionTasks),

			db
				.select({
					id: withdrawalRequests.id,
					wallet: withdrawalRequests.wallet,
					amount: withdrawalRequests.amount,
					status: withdrawalRequests.status,
					createdAt: withdrawalRequests.createdAt,
					userName: profiles.fullName
				})
				.from(withdrawalRequests)
				.innerJoin(profiles, eq(profiles.id, withdrawalRequests.userId))
				.where(sql`${withdrawalRequests.status} in ('REQUESTED', 'APPROVED')`)
				.orderBy(desc(withdrawalRequests.createdAt)),

			db
				.select({
					id: profiles.id,
					fullName: profiles.fullName,
					specialty: profiles.specialty,
					isActive: profiles.isActive
				})
				.from(profiles)
				.where(eq(profiles.role, 'FREELANCER')),

			/** Saldo freelancer yang belum ditarik = kewajiban perusahaan. */
			db
				.select({
					freelancerId: freelancerLedgers.freelancerId,
					available: sql<string>`coalesce(sum(case when ${freelancerLedgers.status} = 'AVAILABLE' then ${freelancerLedgers.amount} else 0 end), 0)`
				})
				.from(freelancerLedgers)
				.groupBy(freelancerLedgers.freelancerId),

			/** Royalti bersih penulis (positif) belum termasuk penarikan. */
			db
				.select({
					amount: royaltyLedgers.amount,
					status: royaltyLedgers.status,
					entryType: royaltyLedgers.entryType
				})
				.from(royaltyLedgers)
		]);

	/* ---------------------------- Agregat keuangan ---------------------------- */
	const billable = invoiceRows.filter((i) => i.status !== 'VOID');
	const revenue = billable.reduce((acc, i) => acc + toNumber(i.paidAmount), 0);
	const contracted = projectRows.reduce((acc, p) => acc + toNumber(p.totalAmount), 0);
	const receivable = billable
		.filter((i) => i.status !== 'PAID')
		.reduce((acc, i) => acc + Math.max(0, toNumber(i.amount) - toNumber(i.paidAmount)), 0);

	const overdueInvoices = billable.filter((i) => i.status === 'OVERDUE');
	const unpaidInvoices = billable.filter((i) => i.status === 'UNPAID');

	/* ----------------------------- Beban produksi ----------------------------- */
	const royaltyEarned = royaltyRows
		.filter((r) => r.entryType === 'ROYALTY' && r.status !== 'CANCELLED')
		.reduce((acc, r) => acc + toNumber(r.amount), 0);

	const freelancerPayable = balances.reduce((acc, b) => acc + toNumber(b.available), 0);

	const activeStatuses = new Set([
		'INITIATED',
		'IN_PRODUCTION',
		'AWAITING_AUTHOR',
		'READY_FOR_PRINT',
		'IN_PRINTING'
	]);

	const tasksByStatus = taskRows.reduce<Record<string, number>>((acc, t) => {
		acc[t.status] = (acc[t.status] ?? 0) + 1;
		return acc;
	}, {});

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const overdueTasks = taskRows.filter(
		(t) =>
			t.deadline && new Date(t.deadline) < today && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
	);

	const awaitingAuthor = projectRows.filter((p) => p.status === 'AWAITING_AUTHOR');

	/* --------------------------- Beban kerja track --------------------------- */
	const trackLoad = (['EDITORIAL', 'LAYOUT', 'COVER', 'LEGAL', 'PRINT'] as const).map((track) => ({
		track,
		open: taskRows.filter(
			(t) => t.track === track && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
		).length,
		review: taskRows.filter((t) => t.track === track && t.status === 'WAITING_AUTHOR_REVIEW').length
	}));

	return {
		analytics: await loadAnalytics(12),
		kpi: {
			activeProjects: projectRows.filter((p) => activeStatuses.has(p.status)).length,
			totalProjects: projectRows.length,
			contracted,
			revenue,
			receivable,
			collectionRate: contracted > 0 ? Math.round((revenue / contracted) * 100) : 0,
			overdueCount: overdueInvoices.length,
			unpaidCount: unpaidInvoices.length,
			tasksInProgress: tasksByStatus['IN_PROGRESS'] ?? 0,
			tasksAwaitingReview: tasksByStatus['WAITING_AUTHOR_REVIEW'] ?? 0,
			overdueTasks: overdueTasks.length,
			awaitingAuthor: awaitingAuthor.length,
			royaltyEarned,
			freelancerPayable,
			pendingWithdrawals: withdrawalRows.length,
			pendingWithdrawalAmount: withdrawalRows.reduce((acc, w) => acc + toNumber(w.amount), 0)
		},
		projects: projectRows.slice(0, 6),
		invoicesDue: [...overdueInvoices, ...unpaidInvoices].slice(0, 6),
		withdrawals: withdrawalRows.slice(0, 4),
		trackLoad,
		activeFreelancers: freelancerRows.filter((f) => f.isActive).length,
		totalFreelancers: freelancerRows.length,
		awaitingAuthorProjects: awaitingAuthor.slice(0, 3),
		/*
		 * Penulis yang perlu disapa ulang: CRM adalah tempatnya, jadi daftarnya
		 * muncul di dasbor tempat pekerjaan dimulai — bukan hanya di dalam CRM.
		 */
		authorsToReach: await authorsNeedingAttention(4)
	};
};
