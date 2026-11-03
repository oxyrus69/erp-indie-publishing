import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '$db';
import type { SQL } from 'drizzle-orm';
import {
	leadActivities,
	leadTags,
	leadTasks,
	leads,
	outreachLogs,
	profiles
} from '$db/schema';
import { fail } from './erpErrors';
import { toMoneyString, toNumber } from './money';

/**
 * Service inti CRM — fondasi prospek & pipeline.
 *
 * Aturan rumah:
 *  - semua nominal lewat `toNumber` (kolomnya string numeric),
 *  - `lastContactAt` adalah DERIVASI dari aktivitas, bukan isian manual,
 *  - tahap MENANG hanya boleh diset lewat konversi (lihat `crm.ts`),
 *    karena konversi yang menyambungkan identitas penulis ke prospek ini.
 */

export type LeadStageValue = 'PROSPEK' | 'KONTAK' | 'PROPOSAL' | 'NEGOSIASI' | 'MENANG' | 'KALAH';

export const LEAD_STAGES: LeadStageValue[] = ['PROSPEK', 'KONTAK', 'PROPOSAL', 'NEGOSIASI', 'MENANG', 'KALAH'];

export const LEAD_STAGE_LABEL: Record<LeadStageValue, string> & Record<string, string> = {
	PROSPEK: 'Prospek',
	KONTAK: 'Kontak',
	PROPOSAL: 'Proposal',
	NEGOSIASI: 'Negosiasi',
	MENANG: 'Menang',
	KALAH: 'Kalah'
};

/**
 * Bobot tahap untuk nilai pipeline terbobot.
 *
 * Angka ini aturan bisnis yang bisa berubah; disimpan di service (single
 * source) sehingga papan, funnel, dan laporan selalu sependapat.
 */
export const LEAD_STAGE_PROBABILITY: Record<LeadStageValue, number> = {
	PROSPEK: 10,
	KONTAK: 25,
	PROPOSAL: 50,
	NEGOSIASI: 75,
	MENANG: 100,
	KALAH: 0
};

export type LeadSourceValue = 'REFERRAL' | 'SOCIAL_MEDIA' | 'EVENT' | 'WEBSITE' | 'PUBLISHER' | 'OTHER';

export const LEAD_SOURCES: LeadSourceValue[] = ['REFERRAL', 'SOCIAL_MEDIA', 'EVENT', 'WEBSITE', 'PUBLISHER', 'OTHER'];

export const LEAD_SOURCE_LABEL: Record<LeadSourceValue, string> & Record<string, string> = {
	REFERRAL: 'Rujukan',
	SOCIAL_MEDIA: 'Media Sosial',
	EVENT: 'Event',
	WEBSITE: 'Website',
	PUBLISHER: 'Penerbit Lain',
	OTHER: 'Lainnya'
};

export type ActivityKindValue = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'NOTE';

export const ACTIVITY_KINDS: ActivityKindValue[] = ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE'];

export const ACTIVITY_KIND_LABEL: Record<ActivityKindValue, string> & Record<string, string> = {
	CALL: 'Telepon',
	WHATSAPP: 'WhatsApp',
	EMAIL: 'Email',
	MEETING: 'Pertemuan',
	NOTE: 'Catatan'
};

export type OutreachChannelValue = 'WHATSAPP' | 'EMAIL';

export const OUTREACH_CHANNELS: OutreachChannelValue[] = ['WHATSAPP', 'EMAIL'];

export const OUTREACH_CHANNEL_LABEL: Record<OutreachChannelValue, string> & Record<string, string> = {
	WHATSAPP: 'WhatsApp',
	EMAIL: 'Email'
};

/**
 * Batas "prospek menjadi dingin".
 *
 * Lebih dari N hari tanpa kontak, dan bukan MENANG, dianggap berisiko
 * hilang — kecuali sudah punya order berjalan, lalu turun menjadi
 * "perlu perhatian" (pekerjaan berjalan = relasi belum mati).
 */
export const HEALTH_DAYS = 30;

export type LeadHealth = 'SEHAT' | 'PERLU_PERHATIAN' | 'BERISIKO';

export const LEAD_HEALTH_LABEL: Record<LeadHealth, string> & Record<string, string> = {
	SEHAT: 'Sehat',
	PERLU_PERHATIAN: 'Perlu perhatian',
	BERISIKO: 'Berisiko dingin'
};

export function leadHealth(input: {
	stage: string;
	lastContactAt: Date | string | null;
	/** Titik nol saat belum pernah dihubungi: prospek baru belum "dingin". */
	createdAt: Date | string;
	hasOpenOrder: boolean;
}): { health: LeadHealth; daysSince: number | null } {
	const baseline = input.lastContactAt ?? input.createdAt;
	const daysSince = input.lastContactAt === null
		? null
		: Math.max(0, Math.floor((Date.now() - new Date(input.lastContactAt).getTime()) / 86_400_000));
	const daysSinceBaseline = Math.max(
		0,
		Math.floor((Date.now() - new Date(baseline).getTime()) / 86_400_000)
	);

	if (input.stage === 'MENANG') return { health: 'SEHAT', daysSince };
	if (daysSinceBaseline <= HEALTH_DAYS) return { health: 'SEHAT', daysSince };
	return { health: input.hasOpenOrder ? 'PERLU_PERHATIAN' : 'BERISIKO', daysSince };
}

/* -------------------------------------------------------------------------- */
/*                                  CRUD LEAD                                 */
/* -------------------------------------------------------------------------- */

export type CreateLeadInput = {
	fullName: string;
	email?: string | null;
	phone?: string | null;
	bookTitle?: string | null;
	genre?: string | null;
	estimatedValue?: number | string | null;
	source: LeadSourceValue;
	ownerId?: string | null;
	notes?: string | null;
};

function assertValidEmail(email: string): void {
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		fail('INVALID_STATE', 'Format email tidak valid.');
	}
}

export async function createLead(input: CreateLeadInput): Promise<{ leadId: string }> {
	const fullName = input.fullName.trim();
	if (fullName.length < 3) fail('INVALID_STATE', 'Nama prospek minimal 3 karakter.');

	const email = input.email?.trim().toLowerCase() || null;
	const phone = input.phone?.trim() || null;
	if (!email && !phone) fail('INVALID_STATE', 'Isi email atau telepon prospek.');
	if (email) assertValidEmail(email);
	if (!LEAD_SOURCES.includes(input.source)) {
		fail('INVALID_STATE', 'Sumber prospek tidak dikenal.');
	}

	const estimated = Math.max(0, Math.round(toNumber(input.estimatedValue)));

	const [row] = await db
		.insert(leads)
		.values({
			fullName,
			email,
			phone,
			bookTitle: input.bookTitle?.trim() || null,
			genre: input.genre?.trim() || null,
			estimatedValue: toMoneyString(estimated),
			stage: 'PROSPEK',
			source: input.source,
			ownerId: input.ownerId ?? null,
			notes: input.notes?.trim() || null
		})
		.returning({ id: leads.id });

	return { leadId: row!.id };
}

export type LeadPatch = {
	fullName?: string;
	email?: string | null;
	phone?: string | null;
	bookTitle?: string | null;
	genre?: string | null;
	estimatedValue?: number | string | null;
	source?: LeadSourceValue;
	ownerId?: string | null;
	notes?: string | null;
};

/**
 * Memperbarui data lead (kecuali tahap; tahap lewat `setStage`).
 *
 * Mengembalikan snapshot sebelum dan sesudah untuk jejak audit.
 */
export async function updateLead(
	leadId: string,
	patch: LeadPatch
): Promise<{ before: LeadRow; after: LeadRow }> {
	const before = await getLead(leadId);
	if (!before) fail('NOT_FOUND', 'Prospek tidak ditemukan.');

	const set: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.fullName !== undefined) {
		if (patch.fullName.trim().length < 3) fail('INVALID_STATE', 'Nama prospek minimal 3 karakter.');
		set.fullName = patch.fullName.trim();
	}
	if (patch.email !== undefined) {
		const clean = patch.email?.trim().toLowerCase() || null;
		if (clean) assertValidEmail(clean);
		set.email = clean;
	}
	if (patch.phone !== undefined) set.phone = patch.phone?.trim() || null;
	if (patch.bookTitle !== undefined) set.bookTitle = patch.bookTitle?.trim() || null;
	if (patch.genre !== undefined) set.genre = patch.genre?.trim() || null;
	if (patch.estimatedValue !== undefined) {
		set.estimatedValue = toMoneyString(Math.max(0, Math.round(toNumber(patch.estimatedValue))));
	}
	if (patch.source !== undefined) {
		if (!LEAD_SOURCES.includes(patch.source)) fail('INVALID_STATE', 'Sumber prospek tidak dikenal.');
		set.source = patch.source;
	}
	if (patch.ownerId !== undefined) set.ownerId = patch.ownerId ?? null;
	if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;

	await db.update(leads).set(set).where(eq(leads.id, leadId));
	const after = (await getLead(leadId))!;
	return { before, after };
}

/**
 * Mengubah tahap ke arah yang tidak melibatkan konversi.
 *
 * KALAH wajib disertai alasan; MENANG TIDAK BOLEH lewat sini karena hanya
 * konversi yang boleh menyetel benderang identitas penulis.
 */
export async function setStage(
	leadId: string,
	stage: 'PROSPEK' | 'KONTAK' | 'PROPOSAL' | 'NEGOSIASI' | 'KALAH',
	lostReason?: string | null
): Promise<{ fromStage: LeadStageValue }> {
	const before = await getLead(leadId);
	if (!before) fail('NOT_FOUND', 'Prospek tidak ditemukan.');
	if (before.authorId) {
		fail(
			'INVALID_STATE',
			'Tahap tidak bisa diubah karena prospek ini sudah dikonversi menjadi penulis.'
		);
	}

	const lost = stage === 'KALAH' ? lostReason?.trim() || 'Alasan tidak dicatat.' : null;
	await db
		.update(leads)
		.set({ stage, lostReason: lost, updatedAt: new Date() })
		.where(eq(leads.id, leadId));

	return { fromStage: before.stage };
}

export async function deleteLead(leadId: string): Promise<{ fullName: string }> {
	const row = await getLead(leadId);
	if (!row) fail('NOT_FOUND', 'Prospek tidak ditemukan.');
	if (row.authorId) {
		fail(
			'INVALID_STATE',
			'Prospek ini sudah dikonversi menjadi penulis; hapus lewat direktori penulis bila perlu.'
		);
	}
	await db.delete(leads).where(eq(leads.id, leadId));
	return { fullName: row.fullName };
}

/* -------------------------------------------------------------------------- */
/*                                   BACA LEAD                                 */
/* -------------------------------------------------------------------------- */

export type LeadRow = {
	id: string;
	fullName: string;
	email: string | null;
	phone: string | null;
	bookTitle: string | null;
	genre: string | null;
	estimatedValue: number;
	stage: LeadStageValue;
	source: LeadSourceValue;
	ownerId: string | null;
	ownerName: string | null;
	notes: string | null;
	authorId: string | null;
	orderId: string | null;
	convertedAt: Date | null;
	lostReason: string | null;
	lastContactAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	tags: string[];
	probability: number;
	health: LeadHealth;
	daysSince: number | null;
	/** Umur prospek dalam hari — dihitung di server agar SSR dan hidrasi sama. */
	ageDays: number;
};

type LeadBaseRow = {
	id: string;
	fullName: string;
	email: string | null;
	phone: string | null;
	bookTitle: string | null;
	genre: string | null;
	estimatedValue: string;
	stage: LeadStageValue;
	source: LeadSourceValue;
	ownerId: string | null;
	ownerName: string | null;
	notes: string | null;
	authorId: string | null;
	orderId: string | null;
	convertedAt: Date | null;
	lostReason: string | null;
	lastContactAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

function baseSelect() {
	return db
		.select({
			id: leads.id,
			fullName: leads.fullName,
			email: leads.email,
			phone: leads.phone,
			bookTitle: leads.bookTitle,
			genre: leads.genre,
			estimatedValue: leads.estimatedValue,
			stage: leads.stage,
			source: leads.source,
			ownerId: leads.ownerId,
			ownerName: profiles.fullName,
			notes: leads.notes,
			authorId: leads.authorId,
			orderId: leads.orderId,
			convertedAt: leads.convertedAt,
			lostReason: leads.lostReason,
			lastContactAt: leads.lastContactAt,
			createdAt: leads.createdAt,
			updatedAt: leads.updatedAt
		})
		.from(leads)
		.leftJoin(profiles, eq(profiles.id, leads.ownerId));
}

function toLeadRow(row: LeadBaseRow, tags: string[]): LeadRow {
	const { health, daysSince } = leadHealth({
		stage: row.stage,
		lastContactAt: row.lastContactAt,
		createdAt: row.createdAt,
		hasOpenOrder: Boolean(row.orderId)
	});
	return {
		...row,
		estimatedValue: toNumber(row.estimatedValue),
		tags,
		probability: LEAD_STAGE_PROBABILITY[row.stage] ?? 0,
		health,
		daysSince,
		ageDays: Math.max(0, Math.floor((Date.now() - row.createdAt.getTime()) / 86_400_000))
	};
}

async function tagsFor(leadId: string): Promise<string[]> {
	const rows = await db.select({ name: leadTags.name }).from(leadTags).where(eq(leadTags.leadId, leadId));
	return rows.map((r) => r.name);
}

export async function getLead(leadId: string): Promise<LeadRow | null> {
	const [row] = await baseSelect().where(eq(leads.id, leadId)).limit(1);
	if (!row) return null;
	return toLeadRow(row as LeadBaseRow, await tagsFor(leadId));
}

export async function listLeads(opts: {
	q: string;
	stage?: string;
	source?: string;
	ownerId?: string;
}): Promise<LeadRow[]> {
	const conditions: SQL[] = [];
	if (opts.stage) conditions.push(eq(leads.stage, opts.stage as never));
	if (opts.source) conditions.push(eq(leads.source, opts.source as never));
	if (opts.ownerId) conditions.push(eq(leads.ownerId, opts.ownerId));
	if (opts.q) {
		const p = `%${opts.q}%`;
		const search = or(
			ilike(leads.fullName, p),
			ilike(sql`coalesce(${leads.email}, '')`, p),
			ilike(sql`coalesce(${leads.bookTitle}, '')`, p),
			ilike(sql`coalesce(${leads.genre}, '')`, p)
		);
		if (search) conditions.push(search);
	}

	const rows = await baseSelect()
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(leads.updatedAt));
	const ids = rows.map((r: LeadBaseRow) => r.id);

	const tagRows: { leadId: string; name: string }[] = ids.length
		? await db
				.select({ leadId: leadTags.leadId, name: leadTags.name })
				.from(leadTags)
				.where(inArray(leadTags.leadId, ids))
		: [];
	const tagBy = new Map<string, string[]>();
	for (const t of tagRows) {
		const arr = tagBy.get(t.leadId) ?? [];
		arr.push(t.name);
		tagBy.set(t.leadId, arr);
	}

	return rows.map((row) => toLeadRow(row as LeadBaseRow, tagBy.get(row.id) ?? []));
}

/* -------------------------------------------------------------------------- */
/*                                  AKTIVITAS                                  */
/* -------------------------------------------------------------------------- */

export type LeadActivityRow = {
	id: string;
	leadId: string;
	kind: ActivityKindValue;
	actorId: string | null;
	actorName: string | null;
	note: string | null;
	createdAt: Date;
};

export async function listActivities(leadId: string): Promise<LeadActivityRow[]> {
	const rows = await db
		.select({
			id: leadActivities.id,
			leadId: leadActivities.leadId,
			kind: leadActivities.kind,
			actorId: leadActivities.actorId,
			actorName: profiles.fullName,
			note: leadActivities.note,
			createdAt: leadActivities.createdAt
		})
		.from(leadActivities)
		.leftJoin(profiles, eq(profiles.id, leadActivities.actorId))
		.where(eq(leadActivities.leadId, leadId))
		.orderBy(desc(leadActivities.createdAt));
	return rows;
}

/**
 * Mencatat aktivitas + memperbarui `lastContactAt`.
 *
 * Catatan internal (`kind=NOTE`) tidak mencegah kontak terakhir: kontak
 * berarti ada percakapan, bukan catukan internal.
 */
export async function addActivity(input: {
	leadId: string;
	kind: ActivityKindValue;
	note?: string | null;
	actorId?: string | null;
}): Promise<{ activityId: string }> {
	const lead = await getLead(input.leadId);
	if (!lead) fail('NOT_FOUND', 'Prospek tidak ditemukan.');
	if (!ACTIVITY_KINDS.includes(input.kind)) fail('INVALID_STATE', 'Jenis aktivitas tidak dikenal.');

	const [row] = await db
		.insert(leadActivities)
		.values({
			leadId: input.leadId,
			kind: input.kind,
			actorId: input.actorId ?? null,
			note: input.note?.trim() || null
		})
		.returning({ id: leadActivities.id });

	if (input.kind !== 'NOTE') {
		await db.update(leads).set({ lastContactAt: new Date() }).where(eq(leads.id, input.leadId));
	}

	return { activityId: row!.id };
}

export async function deleteActivity(activityId: string): Promise<{ leadId: string }> {
	const [row] = await db
		.select({ id: leadActivities.id, leadId: leadActivities.leadId })
		.from(leadActivities)
		.where(eq(leadActivities.id, activityId))
		.limit(1);
	if (!row) fail('NOT_FOUND', 'Aktivitas tidak ditemukan.');

	await db.delete(leadActivities).where(eq(leadActivities.id, activityId));

	/*
	 * lastContactAt adalah turunan: hapus satu baris berarti hitung ulang
	 * dari aktivitas yang masih ada. NOTE tidak dihitung sebagai kontak.
	 */
	const [recompute] = await db
		.select({ last: sql<string>`max(${leadActivities.createdAt})` })
		.from(leadActivities)
		.where(and(eq(leadActivities.leadId, row.leadId), ne(leadActivities.kind, 'NOTE')));

	await db
		.update(leads)
		.set({ lastContactAt: recompute?.last ? new Date(recompute.last) : null })
		.where(eq(leads.id, row.leadId));

	return { leadId: row.leadId };
}

/* -------------------------------------------------------------------------- */
/*                                     TASK                                    */
/* -------------------------------------------------------------------------- */

export type LeadTaskRow = {
	id: string;
	leadId: string;
	title: string;
	/** Kolom `date` Drizzle bertipe string `YYYY-MM-DD`, bukan Date. */
	dueDate: string | null;
	done: boolean;
	doneAt: Date | null;
	createdAt: Date;
};

export async function listTasks(leadId: string): Promise<LeadTaskRow[]> {
	return db
		.select()
		.from(leadTasks)
		.where(eq(leadTasks.leadId, leadId))
		.orderBy(
			asc(sql`case when ${leadTasks.dueDate} is null then 1 else 0 end`),
			asc(sql`coalesce(${leadTasks.dueDate}, '9999-12-31'::date)`),
			asc(leadTasks.createdAt)
		);
}

export async function addTask(input: {
	leadId: string;
	title: string;
	dueDate?: string | null;
}): Promise<{ taskId: string }> {
	const lead = await getLead(input.leadId);
	if (!lead) fail('NOT_FOUND', 'Prospek tidak ditemukan.');
	const title = input.title.trim();
	if (title.length < 3) fail('INVALID_STATE', 'Judul tugas minimal 3 karakter.');

	let due: string | null = null;
	if (input.dueDate) {
		const parsed = new Date(`${input.dueDate}T00:00:00Z`);
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
			Number.isNaN(parsed.getTime()) ||
			parsed.toISOString().slice(0, 10) !== input.dueDate
		) {
			fail('INVALID_STATE', 'Tanggal tugas tidak valid.');
		}
		due = input.dueDate;
	}

	const [row] = await db
		.insert(leadTasks)
		.values({ leadId: input.leadId, title, dueDate: due })
		.returning({ id: leadTasks.id });
	return { taskId: row!.id };
}

export async function toggleTask(taskId: string): Promise<{ done: boolean }> {
	const [row] = await db.select().from(leadTasks).where(eq(leadTasks.id, taskId)).limit(1);
	if (!row) fail('NOT_FOUND', 'Tugas tidak ditemukan.');
	const done = !row.done;
	await db
		.update(leadTasks)
		.set({ done, doneAt: done ? new Date() : null })
		.where(eq(leadTasks.id, taskId));
	return { done };
}

export async function deleteTask(taskId: string): Promise<void> {
	await db.delete(leadTasks).where(eq(leadTasks.id, taskId));
}

/* -------------------------------------------------------------------------- */
/*                                      TAG                                    */
/* -------------------------------------------------------------------------- */

export async function addTag(leadId: string, rawName: string): Promise<{ tagName: string }> {
	const lead = await getLead(leadId);
	if (!lead) fail('NOT_FOUND', 'Prospek tidak ditemukan.');
	const name = rawName.trim().toLowerCase();
	if (name.length < 2 || name.length > 40) fail('INVALID_STATE', 'Tag harus 2–40 karakter.');
	if (lead.tags.includes(name)) fail('INVALID_STATE', 'Tag sudah ada di prospek ini.');
	await db.insert(leadTags).values({ leadId, name }).onConflictDoNothing();
	return { tagName: name };
}

export async function removeTag(leadId: string, name: string): Promise<void> {
	await db.delete(leadTags).where(and(eq(leadTags.leadId, leadId), eq(leadTags.name, name)));
}

/* -------------------------------------------------------------------------- */
/*                                  OUTREACH                                   */
/* -------------------------------------------------------------------------- */

/**
 * Gerakan template → isi akhir.
 *
 * Enam tempat khusus; sisanya teks bebas. Nilai `paket` dan `nilai` diambil
 * dari prospek (estimasi) karena outreach terjadi SEBELUM order ada.
 */
export function fillTemplate(
	body: string,
	ctx: { nama: string; judul: string; paket: string; nilai: string; jatuh_tempo: string }
): string {
	const map: Record<string, string> = {
		'{nama}': ctx.nama,
		'{judul}': ctx.judul,
		'{paket}': ctx.paket,
		'{nilai}': ctx.nilai,
		'{jatuh_tempo}': ctx.jatuh_tempo
	};
	return body.replace(/\{(nama|judul|paket|nilai|jatuh_tempo)\}/g, (m) => map[m] ?? m);
}

export async function logOutreach(input: {
	leadId: string;
	channel: OutreachChannelValue;
	message: string;
	templateId?: string | null;
	actorId?: string | null;
}): Promise<{ logId: string }> {
	const lead = await getLead(input.leadId);
	if (!lead) fail('NOT_FOUND', 'Prospek tidak ditemukan.');
	if (!OUTREACH_CHANNELS.includes(input.channel)) fail('INVALID_STATE', 'Kanal outreach tidak dikenal.');
	const message = input.message.trim();
	if (message.length < 5) fail('INVALID_STATE', 'Pesan outreach belum diisi.');

	const [row] = await db
		.insert(outreachLogs)
		.values({
			leadId: input.leadId,
			channel: input.channel,
			templateId: input.templateId ?? null,
			actorId: input.actorId ?? null,
			message,
			replied: false
		})
		.returning({ id: outreachLogs.id });

	/* Outreach = bentuk kontak; lastContactAt ikut bergerak. */
	await db.update(leads).set({ lastContactAt: new Date() }).where(eq(leads.id, input.leadId));
	return { logId: row!.id };
}

export async function markReplied(logId: string): Promise<{ replied: boolean }> {
	const [row] = await db.select().from(outreachLogs).where(eq(outreachLogs.id, logId)).limit(1);
	if (!row) fail('NOT_FOUND', 'Log outreach tidak ditemukan.');
	const replied = !row.replied;
	await db.update(outreachLogs).set({ replied }).where(eq(outreachLogs.id, logId));
	return { replied };
}

export async function listOutreach(leadId: string) {
	const rows = await db
		.select({
			id: outreachLogs.id,
			channel: outreachLogs.channel,
			templateId: outreachLogs.templateId,
			actorName: profiles.fullName,
			message: outreachLogs.message,
			replied: outreachLogs.replied,
			createdAt: outreachLogs.createdAt
		})
		.from(outreachLogs)
		.leftJoin(profiles, eq(profiles.id, outreachLogs.actorId))
		.where(eq(outreachLogs.leadId, leadId))
		.orderBy(desc(outreachLogs.createdAt));
	return rows;
}

/* -------------------------------------------------------------------------- */
/*                                     KPI                                    */
/* -------------------------------------------------------------------------- */

/** Agregat pipeline untuk baris KPI. Semua dihitung sekali per render. */
export async function pipelineKpi(): Promise<{
	prospek: number;
	aktif: number;
	pipelineValue: number;
	weightedValue: number;
	winMonth: number;
	winValueMonth: number;
	lostMonth: number;
	atRisk: number;
}> {
	const rows = await db
		.select({
			total: sql<number>`count(*)::int`,
			aktif: sql<number>`count(*) filter (where ${leads.stage} in ('PROSPEK','KONTAK','PROPOSAL','NEGOSIASI'))::int`,
			pipeline: sql<string>`coalesce(sum(case when ${leads.stage} in ('PROSPEK','KONTAK','PROPOSAL','NEGOSIASI') then ${leads.estimatedValue} else 0 end), 0)`,
			/* Bobot tahap: angka dari LEAD_STAGE_PROBABILITY, disalin ke SQL agar satu query. */
			weighted: sql<string>`coalesce(sum(case
				when ${leads.stage} = 'PROSPEK' then ${leads.estimatedValue} * 0.10
				when ${leads.stage} = 'KONTAK' then ${leads.estimatedValue} * 0.25
				when ${leads.stage} = 'PROPOSAL' then ${leads.estimatedValue} * 0.50
				when ${leads.stage} = 'NEGOSIASI' then ${leads.estimatedValue} * 0.75
				else 0 end), 0)`,
			berisiko: sql<number>`count(*) filter (
				where ${leads.stage} in ('PROSPEK','KONTAK','PROPOSAL','NEGOSIASI')
				and coalesce(${leads.lastContactAt}, ${leads.createdAt}) < now() - make_interval(days => ${HEALTH_DAYS})
			)::int`,
			winMonth: sql<number>`count(*) filter (
				where ${leads.stage} = 'MENANG'
				and ${leads.convertedAt} >= date_trunc('month', now())
			)::int`,
			winValueMonth: sql<string>`coalesce(sum(case when ${leads.stage} = 'MENANG'
				and ${leads.convertedAt} >= date_trunc('month', now()) then ${leads.estimatedValue} else 0 end), 0)`,
			lostMonth: sql<number>`count(*) filter (
				where ${leads.stage} = 'KALAH'
				and ${leads.updatedAt} >= date_trunc('month', now())
			)::int`
		})
		.from(leads)
		.limit(1);

	const r = rows[0];
	return {
		prospek: r?.total ?? 0,
		aktif: r?.aktif ?? 0,
		pipelineValue: toNumber(r?.pipeline ?? 0),
		weightedValue: toNumber(r?.weighted ?? 0),
		winMonth: r?.winMonth ?? 0,
		winValueMonth: toNumber(r?.winValueMonth ?? 0),
		lostMonth: r?.lostMonth ?? 0,
		atRisk: r?.berisiko ?? 0
	};
}
