import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	invoices,
	leadTasks,
	leads,
	notifications,
	orders,
	productionTasks,
	profiles,
	withdrawalRequests
} from '$db/schema';
import type { UserRole } from '$db/schema';
import { HEALTH_DAYS } from './leads';

/**
 * Pusat notifikasi.
 *
 * Notifikasi tidak dihitung ulang tiap muat halaman lalu menghilang saat
 * navigasi. Barisnya dipersistenkan dengan `dedupeKey` unik per penerima:
 *
 *  - kejadian yang sama tidak menumpuk (upsert `on conflict do nothing`),
 *  - status "sudah dibaca" bertahan setelah reload,
 *  - lencana jumlah belum-dibaca cukup satu query.
 *
 * `syncNotifications()` dipanggil dari layout aplikasi (sekali per muat
 * halaman, murah karena berbasis `insert ... select`), bukan dari setiap
 * komponen.
 */

export type NotificationCategory =
	| 'invoice_due'
	| 'invoice_overdue'
	| 'task_overdue'
	| 'task_review'
	| 'withdrawal_pending'
	| 'comment'
	| 'crm_followup_due'
	| 'crm_lead_cold';

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

const STAFF_ROLES: UserRole[] = ['SUPER_ADMIN', 'FINANCE'];
const PM_ROLES: UserRole[] = ['SUPER_ADMIN', 'PROJECT_MANAGER'];

type NotificationInsert = {
	userId: string;
	dedupeKey: string;
	category: NotificationCategory;
	severity: NotificationSeverity;
	title: string;
	body?: string | null;
	href?: string | null;
	entityType?: string | null;
	entityId?: string | null;
};

/**
 * Notifikasi komentar baru pada sebuah task.
 *
 * Penerimanya adalah pihak lain yang terlibat: penulis proyek, freelancer yang
 * ditugaskan, dan manajer proyek. Penulis komentar sendiri tidak diberi tahu.
 *
 * `dedupeKey` memakai id komentar, jadi satu komentar menghasilkan paling
 * banyak satu baris per penerima — bukan satu per pemuatan halaman.
 */
export async function notifyComment(input: {
	commentId: string;
	taskId: string;
	taskTitle: string;
	projectTitle: string;
	authorName: string;
	authorId: string;
	/** true = catatan staf; hanya staf lain yang perlu tahu. */
	isInternal: boolean;
	staffOnlyHref?: string | null;
}): Promise<void> {
	try {
		const [row] = await db
			.select({
				authorId: orders.authorId,
				assigneeId: productionTasks.assigneeId,
				managerId: bookProjects.managerId,
				projectId: bookProjects.id
			})
			.from(productionTasks)
			.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
			.innerJoin(orders, eq(orders.id, bookProjects.orderId))
			.where(eq(productionTasks.id, input.taskId))
			.limit(1);

		if (!row) return;

		const recipients = new Set<string>(row.managerId ? [row.managerId] : []);
		if (!input.isInternal) {
			if (row.authorId) recipients.add(row.authorId);
			if (row.assigneeId) recipients.add(row.assigneeId);
		} else {
			/* Catatan internal: staf lain tetap perlu melihatnya. */
			const staff = await db
				.select({ id: profiles.id })
				.from(profiles)
				.where(
					and(
						inArray(profiles.role, [...STAFF_ROLES, ...PM_ROLES]),
						eq(profiles.isActive, true)
					)
				);
			for (const person of staff) recipients.add(person.id);
		}

		recipients.delete(input.authorId);
		if (recipients.size === 0) return;

		/*
		 * Tautan harus bisa dibuka penerimanya. Penulis tidak boleh diarahkan
		 * ke `/projects/...` (403) dan freelancer ke halaman yang sama, jadi
		 * tujuan dipilih per peran — bukan satu URL untuk semua.
		 */
		const projectId = row.projectId;
		const roles = await db
			.select({ id: profiles.id, role: profiles.role })
			.from(profiles)
			.where(inArray(profiles.id, [...recipients]));
		const roleById = new Map(roles.map((r) => [r.id, r.role as UserRole]));

		function hrefFor(userId: string): string | null {
			const role = roleById.get(userId);
			if (input.isInternal) return input.staffOnlyHref ?? `/projects/${projectId}`;
			if (role === 'AUTHOR') return '/portal';
			if (role === 'FREELANCER') return '/freelancer';
			return `/projects/${projectId}`;
		}

		await insertMany(
			[...recipients].map((userId) => ({
				userId,
				dedupeKey: `comment:${input.commentId}`,
				category: 'comment' as NotificationCategory,
				severity: 'info' as NotificationSeverity,
				title: `Komentar baru dari ${input.authorName}`,
				body: `${input.projectTitle} · ${input.taskTitle}${input.isInternal ? ' (catatan internal)' : ''}`,
				href: hrefFor(userId),
				entityType: 'task',
				entityId: input.taskId
			}))
		);
	} catch (e) {
		console.error('[notifications] gagal menyiapkan notifikasi komentar:', e);
	}
}

/** Tanggal hari ini dalam bentuk `YYYY-MM-DD` (zona waktu server). */
function todayISO(): string {
	const now = new Date();
	const offset = now.getTimezoneOffset() * 60_000;
	return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Membuat ulang notifikasi dari kondisi nyata.
 *
 * Semua operasi berbasis himpunan (bukan loop per baris) supaya tetap murah
 * saat data bertambah. Setiap penyisipan memakai `onConflictDoNothing` pada
 * (user_id, dedupe_key) sehingga menjalankannya 100 kali tetap menghasilkan
 * satu baris per kejadian.
 */
export async function syncNotifications(): Promise<void> {
	const today = todayISO();

	/* --------------------------- Penerima per peran --------------------------- */
	const staff = await db
		.select({ id: profiles.id, role: profiles.role })
		.from(profiles)
		.where(and(inArray(profiles.role, [...STAFF_ROLES, ...PM_ROLES]), eq(profiles.isActive, true)));

	const financeIds = staff
		.filter((p) => STAFF_ROLES.includes(p.role as UserRole))
		.map((p) => p.id);
	const pmIds = staff.filter((p) => PM_ROLES.includes(p.role as UserRole)).map((p) => p.id);

	/* ---------------------- Invoice jatuh tempo / lewat ---------------------- */
	const dueInvoices = await db
		.select({
			id: invoices.id,
			invoiceNumber: invoices.invoiceNumber,
			dueDate: invoices.dueDate,
			status: invoices.status,
			outstanding: sql<string>`greatest(${invoices.amount} - ${invoices.paidAmount}, 0)`,
			projectTitle: bookProjects.title,
			orderNumber: orders.orderNumber
		})
		.from(invoices)
		.innerJoin(orders, eq(orders.id, invoices.orderId))
		.leftJoin(bookProjects, eq(bookProjects.orderId, orders.id))
		.where(
			sql`${invoices.status} <> 'VOID'
				and ${invoices.status} <> 'PAID'
				and ${invoices.dueDate} is not null
				and ${invoices.dueDate} <= current_date`
		);

	if (financeIds.length > 0 && dueInvoices.length > 0) {
		const rows = dueInvoices.flatMap((inv) => {
			const overdue = inv.dueDate !== null && inv.dueDate < today;
			const label = inv.projectTitle ?? inv.orderNumber;
			return financeIds.map((userId) => ({
				userId,
				dedupeKey: `invoice:${inv.id}:${overdue ? 'overdue' : 'due'}:${inv.dueDate}`,
				category: (overdue ? 'invoice_overdue' : 'invoice_due') as NotificationCategory,
				severity: (overdue ? 'danger' : 'warning') as NotificationSeverity,
				title: overdue
					? `Invoice ${inv.invoiceNumber} lewat jatuh tempo`
					: `Invoice ${inv.invoiceNumber} jatuh tempo hari ini`,
				body: `${label} · sisa tagihan perlu ditindaklanjuti.`,
				href: '/admin/finance?tab=receivables&bucket=overdue',
				entityType: 'invoice',
				entityId: inv.id
			}));
		});
		await insertMany(rows);
	}

	/* --------------------------- Task lewat tenggat -------------------------- */
	const overdueTasks = await db
		.select({
			id: productionTasks.id,
			title: productionTasks.title,
			deadline: productionTasks.deadline,
			assigneeId: productionTasks.assigneeId,
			projectId: bookProjects.id,
			projectTitle: bookProjects.title,
			managerId: bookProjects.managerId
		})
		.from(productionTasks)
		.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
		.where(
			sql`${productionTasks.deadline} is not null
				and ${productionTasks.deadline} < current_date
				and ${productionTasks.status} not in ('COMPLETED', 'CANCELLED')`
		);

	if (overdueTasks.length > 0) {
		const rows = overdueTasks.flatMap((task) => {
			const targets = new Set<string>(pmIds);
			if (task.managerId) targets.add(task.managerId);
			/* Freelancer yang mengerjakan juga perlu tahu tenggatnya lewat. */
			if (task.assigneeId) targets.add(task.assigneeId);
			return [...targets].map((userId) => ({
				userId,
				dedupeKey: `task-overdue:${task.id}:${task.deadline}`,
				category: 'task_overdue' as NotificationCategory,
				severity: 'warning' as NotificationSeverity,
				title: `Task lewat tenggat: ${task.title}`,
				body: `${task.projectTitle} · tenggat ${task.deadline}.`,
				href: `/projects/${task.projectId}`,
				entityType: 'task',
				entityId: task.id
			}));
		});
		await insertMany(rows);
	}

	/* ----------------------- Task menunggu review penulis -------------------- */
	const reviewTasks = await db
		.select({
			id: productionTasks.id,
			title: productionTasks.title,
			projectId: bookProjects.id,
			projectTitle: bookProjects.title,
			authorId: orders.authorId
		})
		.from(productionTasks)
		.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
		.innerJoin(orders, eq(orders.id, bookProjects.orderId))
		.where(eq(productionTasks.status, 'WAITING_AUTHOR_REVIEW'));

	if (reviewTasks.length > 0) {
		await insertMany(
			reviewTasks.map((task) => ({
				userId: task.authorId,
				dedupeKey: `task-review:${task.id}`,
				category: 'task_review' as NotificationCategory,
				severity: 'info' as NotificationSeverity,
				title: `Menunggu review Anda: ${task.title}`,
				body: `${task.projectTitle} · buka portal untuk menyetujui atau meminta revisi.`,
				href: '/portal',
				entityType: 'task',
				entityId: task.id
			}))
		);
	}

	/* ----------- Tugas follow-up CRM jatuh tempo / hari ini -------------- */
	if (pmIds.length > 0) {
		const dueTasks = await db
			.select({
				id: leadTasks.id,
				title: leadTasks.title,
				dueDate: leadTasks.dueDate,
				leadId: leads.id,
				leadName: leads.fullName,
				ownerId: leads.ownerId
			})
			.from(leadTasks)
			.innerJoin(leads, eq(leads.id, leadTasks.leadId))
			.where(
				sql`${leadTasks.done} = false
					and ${leadTasks.dueDate} is not null
					and ${leadTasks.dueDate} <= current_date`
			);

		if (dueTasks.length > 0) {
			await insertMany(
				dueTasks.flatMap((t) => {
					const targets = new Set<string>(pmIds);
					if (t.ownerId) targets.add(t.ownerId);
					return [...targets].map((userId) => ({
						userId,
						dedupeKey: `crm-task:${t.id}:${t.dueDate}`,
						category: 'crm_followup_due' as NotificationCategory,
						severity: 'warning' as NotificationSeverity,
						title: `Follow-up jatuh tempo: ${t.leadName}`,
						body: `${t.title} · tugas CRM menunggu tindak lanjut.`,
						href: `/crm/${t.leadId}`,
						entityType: 'lead',
						entityId: t.leadId
					}));
				})
			);
		}
	}

	/* ------------------- Prospek dingin (tidak disentuh) ------------------- */
	/*
	 * Lead aktif (belum menang/kalah) yang `last_contact_at` lebih tua dari
	 * HEALTH_DAYS hari. Satu notifikasi per lead per 7 hari (dedupe bergulir)
	 * supaya lonjakan saat data lama tidak membanjiri lonceng.
	 */
	if (pmIds.length > 0) {
		const rollingKey = Math.floor(Date.now() / (7 * 86_400_000));
		const coldLeads = await db
			.select({
				id: leads.id,
				fullName: leads.fullName,
				ownerId: leads.ownerId
			})
			.from(leads)
			.where(
				sql`${leads.stage} in ('PROSPEK','KONTAK','PROPOSAL','NEGOSIASI')
					and coalesce(${leads.lastContactAt}, ${leads.createdAt}) < now() - make_interval(days => ${HEALTH_DAYS})`
			);

		if (coldLeads.length > 0) {
			await insertMany(
				coldLeads.flatMap((l) => {
					const targets = new Set<string>(pmIds);
					if (l.ownerId) targets.add(l.ownerId);
					return [...targets].map((userId) => ({
						userId,
						dedupeKey: `crm-cold:${l.id}:${rollingKey}`,
						category: 'crm_lead_cold' as NotificationCategory,
						severity: 'info' as NotificationSeverity,
						title: `Prospek dingin: ${l.fullName}`,
						body: `Tidak ada kontak lebih dari ${HEALTH_DAYS} hari. Jadwalkan follow-up.`,
						href: `/crm/${l.id}`,
						entityType: 'lead',
						entityId: l.id
					}));
				})
			);
		}
	}

	/* -------------------------- Penarikan menunggu --------------------------- */
	const pendingWithdrawals = await db
		.select({
			id: withdrawalRequests.id,
			amount: withdrawalRequests.amount,
			wallet: withdrawalRequests.wallet,
			userName: profiles.fullName
		})
		.from(withdrawalRequests)
		.innerJoin(profiles, eq(profiles.id, withdrawalRequests.userId))
		.where(inArray(withdrawalRequests.status, ['REQUESTED', 'APPROVED']));

	if (financeIds.length > 0 && pendingWithdrawals.length > 0) {
		await insertMany(
			pendingWithdrawals.flatMap((w) =>
				financeIds.map((userId) => ({
					userId,
					dedupeKey: `withdrawal:${w.id}`,
					category: 'withdrawal_pending' as NotificationCategory,
					severity: 'warning' as NotificationSeverity,
					title: `Penarikan menunggu: ${w.userName}`,
					body:
						w.wallet === 'ROYALTY'
							? 'Permintaan penarikan royalti penulis menunggu persetujuan.'
							: 'Permintaan penarikan komisi freelancer menunggu persetujuan.',
					href: '/admin/finance?tab=payables',
					entityType: 'withdrawal',
					entityId: w.id
				}))
			)
		);
	}
}

async function insertMany(rows: NotificationInsert[]): Promise<void> {
	if (rows.length === 0) return;
	try {
		await db.insert(notifications).values(rows).onConflictDoNothing({
			target: [notifications.userId, notifications.dedupeKey]
		});
	} catch (e) {
		console.error('[notifications] gagal menyinkronkan:', e);
	}
}

/** Notifikasi yang belum dibaca untuk satu pengguna. */
export async function unreadCount(userId: string): Promise<number> {
	await syncNotifications().catch(() => {});
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	return row?.count ?? 0;
}
