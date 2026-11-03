import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	leadActivities,
	leadTags,
	leads,
	orders,
	profiles,
	royaltyLedgers
} from '$db/schema';
import { toNumber } from './money';
import { HEALTH_DAYS, leadHealth, type LeadHealth } from './leads';

/**
 * Profil 360 penulis.
 *
 * Halaman direktori penulis menjawab "siapa saja penulis kami". Halaman ini
 * menjawab pertanyaan yang muncul sesudahnya: "penulis ini bagaimana?". Semua
 * dari baris nyata — tidak ada skor yang disimpan, karena skor tersimpan akan
 * berbohong begitu satu aktivitas ditambahkan.
 *
 * Sumber sentuhan terakhir adalah lead yang SUDAH dikonversi ke akun ini.
 * Penulis yang masuk lewat undangan langsung (bukan lewat CRM) tidak punya
 * baris lead, dan itu ditampilkan apa adanya: "belum pernah lewat CRM".
 */

export type AuthorHealth = LeadHealth;

export type AuthorOverview = {
	id: string;
	fullName: string;
	email: string | null;
	phone: string | null;
	isActive: boolean;
	createdAt: Date;
	specialty: string | null;
	orderCount: number;
	activeOrderCount: number;
	bookCount: number;
	contractValue: number;
	publishedCount: number;
	royaltyAvailable: number;
	royaltyWithdrawn: number;
	lastContactAt: Date | null;
	daysSinceContact: number | null;
	health: AuthorHealth;
	/** Lead CRM yang menjadi akun ini (bila ada). */
	leadId: string | null;
	leadStage: string | null;
	leadTags: string[];
	/** Jumlah aktivitas CRM yang tercatat untuk lead tersebut. */
	activityCount: number;
};

const ACTIVE_ORDER_STATUSES = [
	'AWAITING_DOWN_PAYMENT',
	'IN_PRODUCTION',
	'AWAITING_FINAL_SETTLEMENT',
	'READY_FOR_RELEASE'
] as const;

export async function authorOverview(authorId: string): Promise<AuthorOverview | null> {
	const [person] = await db
		.select({
			id: profiles.id,
			fullName: profiles.fullName,
			email: profiles.email,
			phone: profiles.phone,
			isActive: profiles.isActive,
			createdAt: profiles.createdAt,
			specialty: profiles.specialty
		})
		.from(profiles)
		.where(and(eq(profiles.id, authorId), eq(profiles.role, 'AUTHOR')))
		.limit(1);

	if (!person) return null;

	const [orderStats] = await db
		.select({
			orderCount: sql<number>`count(distinct ${orders.id})::int`,
			activeOrderCount: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} in ('AWAITING_DOWN_PAYMENT','IN_PRODUCTION','AWAITING_FINAL_SETTLEMENT','READY_FOR_RELEASE'))::int`,
			contractValue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`
		})
		.from(orders)
		.where(eq(orders.authorId, authorId));

	const [bookStats] = await db
		.select({
			bookCount: sql<number>`count(*)::int`,
			publishedCount: sql<number>`count(*) filter (where ${bookProjects.status} = 'PUBLISHED')::int`
		})
		.from(bookProjects)
		.innerJoin(orders, eq(orders.id, bookProjects.orderId))
		.where(eq(orders.authorId, authorId));

	const [royalty] = await db
		.select({
			available: sql<string>`coalesce(sum(case when ${royaltyLedgers.status} = 'AVAILABLE' then ${royaltyLedgers.amount} else 0 end), 0)`,
			withdrawn: sql<string>`coalesce(sum(case when ${royaltyLedgers.status} = 'WITHDRAWN' then ${royaltyLedgers.amount} else 0 end), 0)`
		})
		.from(royaltyLedgers)
		.where(eq(royaltyLedgers.authorId, authorId));

	/* Lead yang menjadi akun ini: satu baris, kalau ada. */
	const [lead] = await db
		.select({
			id: leads.id,
			stage: leads.stage,
			lastContactAt: leads.lastContactAt,
			createdAt: leads.createdAt
		})
		.from(leads)
		.where(eq(leads.authorId, authorId))
		.orderBy(desc(leads.convertedAt))
		.limit(1);

	let tagNames: string[] = [];
	let activityCount = 0;
	if (lead) {
		const tags = await db
			.select({ name: leadTags.name })
			.from(leadTags)
			.where(eq(leadTags.leadId, lead.id));
		tagNames = tags.map((t) => t.name);

		const [count] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(leadActivities)
			.where(eq(leadActivities.leadId, lead.id));
		activityCount = count?.count ?? 0;
	}

	const activeOrderCount = orderStats?.activeOrderCount ?? 0;
	const { health } = leadHealth({
		stage: lead?.stage ?? (activeOrderCount > 0 ? 'NEGOSIASI' : 'MENANG'),
		lastContactAt: lead?.lastContactAt ?? null,
		createdAt: lead?.createdAt ?? person.createdAt,
		hasOpenOrder: activeOrderCount > 0
	});

	const daysSinceContact = lead?.lastContactAt
		? Math.max(
				0,
				Math.floor((Date.now() - new Date(lead.lastContactAt).getTime()) / 86_400_000)
			)
		: null;

	return {
		...person,
		orderCount: orderStats?.orderCount ?? 0,
		activeOrderCount,
		bookCount: bookStats?.bookCount ?? 0,
		publishedCount: bookStats?.publishedCount ?? 0,
		contractValue: toNumber(orderStats?.contractValue ?? 0),
		royaltyAvailable: toNumber(royalty?.available ?? 0),
		royaltyWithdrawn: toNumber(royalty?.withdrawn ?? 0),
		lastContactAt: lead?.lastContactAt ?? null,
		daysSinceContact,
		health: activeOrderCount > 0 ? 'SEHAT' : health,
		leadId: lead?.id ?? null,
		leadStage: lead?.stage ?? null,
		leadTags: tagNames,
		activityCount
	};
}

export type AuthorOrderRow = {
	id: string;
	orderNumber: string;
	bookTitle: string | null;
	status: string;
	totalAmount: number;
	paidAmount: number;
	createdAt: Date;
};

export async function authorOrders(authorId: string, limit = 10): Promise<AuthorOrderRow[]> {
	const rows = await db
		.select({
			id: orders.id,
			orderNumber: orders.orderNumber,
			bookTitle: orders.bookTitle,
			status: orders.status,
			totalAmount: orders.totalAmount,
			paidAmount: orders.paidAmount,
			createdAt: orders.createdAt
		})
		.from(orders)
		.where(eq(orders.authorId, authorId))
		.orderBy(desc(orders.createdAt))
		.limit(limit);

	return rows.map((row) => ({
		...row,
		totalAmount: toNumber(row.totalAmount),
		paidAmount: toNumber(row.paidAmount)
	}));
}

export type AuthorBookRow = {
	projectId: string;
	title: string;
	/** `null` = proyek belum masuk antrean cetak. */
	printStage: string | null;
	status: string;
	createdAt: Date;
};

export async function authorBooks(authorId: string, limit = 10): Promise<AuthorBookRow[]> {
	return db
		.select({
			projectId: bookProjects.id,
			title: bookProjects.title,
			printStage: bookProjects.printStage,
			status: bookProjects.status,
			createdAt: bookProjects.createdAt
		})
		.from(bookProjects)
		.innerJoin(orders, eq(orders.id, bookProjects.orderId))
		.where(eq(orders.authorId, authorId))
		.orderBy(desc(bookProjects.createdAt))
		.limit(limit);
}

/**
 * Penulis yang perlu perhatian.
 *
 * Aturannya sempit dan bisa dijelaskan: tidak ada kontak (lewat CRM) lebih dari
 * `HEALTH_DAYS` hari, belum punya order berjalan, dan masih aktif. Penulis yang
 * sedang dikerjakan bukunya tidak masuk daftar — mereka sedang dihubungi lewat
 * produksi, bukan lewat CRM.
 */
export type AuthorNeedsAttention = {
	id: string;
	fullName: string;
	email: string | null;
	daysSinceContact: number | null;
	leadId: string | null;
	orderCount: number;
};

export async function authorsNeedingAttention(limit = 8): Promise<AuthorNeedsAttention[]> {
	const rows = await db
		.select({
			id: profiles.id,
			fullName: profiles.fullName,
			email: profiles.email,
			createdAt: profiles.createdAt,
			lastContactAt: leads.lastContactAt,
			leadId: leads.id,
			activeOrders: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} in ('AWAITING_DOWN_PAYMENT','IN_PRODUCTION','AWAITING_FINAL_SETTLEMENT','READY_FOR_RELEASE'))::int`,
			orderCount: sql<number>`count(distinct ${orders.id})::int`
		})
		.from(profiles)
		.leftJoin(leads, eq(leads.authorId, profiles.id))
		.leftJoin(orders, eq(orders.authorId, profiles.id))
		.where(and(eq(profiles.role, 'AUTHOR'), eq(profiles.isActive, true)))
		.groupBy(profiles.id, profiles.fullName, profiles.email, profiles.createdAt, leads.lastContactAt, leads.id);

	const out: AuthorNeedsAttention[] = [];
	for (const row of rows) {
		if (row.activeOrders > 0) continue;
		const baseline = row.lastContactAt ?? row.createdAt;
		const days = Math.max(
			0,
			Math.floor((Date.now() - new Date(baseline).getTime()) / 86_400_000)
		);
		if (days <= HEALTH_DAYS) continue;
		out.push({
			id: row.id,
			fullName: row.fullName,
			email: row.email,
			daysSinceContact: row.lastContactAt ? days : null,
			leadId: row.leadId,
			orderCount: row.orderCount
		});
	}

	return out.sort((a, b) => (b.daysSinceContact ?? 999) - (a.daysSinceContact ?? 999)).slice(0, limit);
}
