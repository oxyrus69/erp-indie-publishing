import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	leadActivities,
	leadTasks,
	leads,
	messageTemplates,
	outreachLogs,
	profiles
} from '$db/schema';
import { createAccount } from './accounts';
import { fail } from './erpErrors';
import { toNumber } from './money';
import {
	addActivity,
	getLead,
	LEAD_STAGE_PROBABILITY,
	type LeadStageValue
} from './leads';

/**
 * Konversi prospek menjadi penulis.
 *
 * Alur sebenarnya di meja penerbitan:
 *  1. Prospek untung — tawaran diterima.
 *  2. Orang ini harus bisa login ke portal dan dibuatkan order.
 *  3. Sejarah CRM (percakapan, aktivitas) harus tetap menempel.
 *
 * Karena itu konversi TIDAK membuat profil baru dari nol:
 *  - bila email sudah punya akun (mungkin diundang dulu lewat
 *    `/admin/penulis`), lead menunjuk ke akun itu (re-attach),
 *  - bila belum, akun baru dibuat LANGSUNG di `auth.users` lewat
 *    `createAccount` sehingga foreign key `profiles.id` tidak dilanggar.
 *
 * Idempoten: kolom `authorId` sudah terisi berarti konversi sukses,
 * dan memanggil ulang mengembalikan data yang sama, bukan error.
 */
export type ConvertLeadResult = {
	leadId: string;
	authorId: string;
	authorName: string;
	createdAccount: boolean;
};

export async function convertLead(leadId: string, actor: { id: string; fullName: string }): Promise<ConvertLeadResult> {
	const lead = await getLead(leadId);
	if (!lead) fail('NOT_FOUND', 'Prospek tidak ditemukan.');

	/* Idempoten kembali: konversi sudah terjadi. */
	if (lead.authorId) {
		const [existing] = await db
			.select({ fullName: profiles.fullName })
			.from(profiles)
			.where(eq(profiles.id, lead.authorId))
			.limit(1);
		return {
			leadId,
			authorId: lead.authorId,
			authorName: existing?.fullName ?? lead.fullName,
			createdAccount: false
		};
	}

	if (!lead.email) {
		fail('INVALID_STATE', 'Prospek butuh email untuk dikonversi menjadi penulis.');
	}

	let authorId: string;
	let createdAccount = false;

	const [existingByEmail] = await db
		.select({ id: profiles.id, role: profiles.role })
		.from(profiles)
		.where(eq(profiles.email, lead.email.toLowerCase()))
		.limit(1);

	if (existingByEmail) {
		/* Akun sudah ada: unlikely ada role lain. */
		if (existingByEmail.role !== 'AUTHOR') {
			fail('INVALID_STATE', `Email ini sudah dipakai akun berperan ${existingByEmail.role}.`);
		}
		authorId = existingByEmail.id;
	} else {
		const created = await createAccount({
			email: lead.email,
			fullName: lead.fullName,
			role: 'AUTHOR',
			phone: lead.phone ?? null
		});
		authorId = created.id;
		createdAccount = true;
	}

	await db
		.update(leads)
		.set({
			stage: 'MENANG',
			authorId,
			convertedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(leads.id, leadId));

	/* Bukti konversi di timeline, bukan hanya di kolom. */
	await addActivity({
		leadId,
		kind: 'NOTE',
		note: `Dikonversi menjadi penulis oleh ${actor.fullName}.`,
		actorId: actor.id
	});

	const [author] = await db
		.select({ fullName: profiles.fullName })
		.from(profiles)
		.where(eq(profiles.id, authorId))
		.limit(1);

	return {
		leadId,
		authorId,
		authorName: author?.fullName ?? lead.fullName,
		createdAccount
	};
}

/* -------------------------------------------------------------------------- */
/*                    ALIRAN:/feed aktivitas untuk halaman /crm                 */
/* -------------------------------------------------------------------------- */

export type ActivityFeedRow = {
	activityId: string;
	leadId: string;
	kind: string;
	note: string | null;
	actorName: string | null;
	leadName: string;
	leadStage: string;
	bookTitle: string | null;
	createdAt: Date;
};

/**
 * Feed aktivitas terbaru lintas prospek untuk `/crm/aktivitas`.
 * Pengurutan: terbaru dulu, dibatasi 100.
 */
export async function recentActivities(limit = 100): Promise<ActivityFeedRow[]> {
	const rows = await db
		.select({
			activityId: leadActivities.id,
			leadId: leadActivities.leadId,
			kind: leadActivities.kind,
			note: leadActivities.note,
			actorName: profiles.fullName,
			leadName: leads.fullName,
			leadStage: leads.stage,
			bookTitle: leads.bookTitle,
			createdAt: leadActivities.createdAt
		})
		.from(leadActivities)
		.innerJoin(leads, eq(leads.id, leadActivities.leadId))
		.leftJoin(profiles, eq(profiles.id, leadActivities.actorId))
		.orderBy(desc(leadActivities.createdAt))
		.limit(limit);

	return rows;
}

export type TaskDueRow = {
	taskId: string;
	leadId: string;
	leadName: string;
	leadStage: string;
	title: string;
	/** `YYYY-MM-DD` dari kolom date. */
	dueDate: string | null;
	done: boolean;
	overdue: boolean;
	today: boolean;
};

/**
 * Tugas follow-up belum selesai.
 *
 * `overdue` = lewat tenggat dan belum dikerjakan; `today` = jatuh tempo
 * hari ini. Dipakai untuk notifikasi dan halaman Kegiatan.
 */
export async function dueTasks(): Promise<TaskDueRow[]> {
	const today = todayISO();
	const rows = await db
		.select({
			taskId: leadTasks.id,
			leadId: leadTasks.leadId,
			leadName: leads.fullName,
			leadStage: leads.stage,
			title: leadTasks.title,
			dueDate: leadTasks.dueDate,
			done: leadTasks.done
		})
		.from(leadTasks)
		.innerJoin(leads, eq(leads.id, leadTasks.leadId))
		.orderBy(
			asc(sql`case when ${leadTasks.dueDate} is null then 1 else 0 end`),
			asc(sql`coalesce(${leadTasks.dueDate}, '9999-12-31'::date)`)
		);

	return rows
		.filter((r) => !r.done)
		.map((r) => ({
			taskId: r.taskId,
			leadId: r.leadId,
			leadName: r.leadName,
			leadStage: r.leadStage,
			title: r.title,
			dueDate: r.dueDate,
			done: false,
			overdue: r.dueDate !== null && r.dueDate < today,
			today: r.dueDate === today
		}));
}

/** Tanggal hari ini `YYYY-MM-DD` di zona waktu server. */
function todayISO(): string {
	const now = new Date();
	const offset = now.getTimezoneOffset() * 60_000;
	return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export type StaffStatsRow = {
	name: string;
	count: number;
};

/** Berapa aktivitas CRM yang dicatat tiap staf aktif. */
export async function activityByStaff(days = 30): Promise<StaffStatsRow[]> {
	const rows = await db
		.select({
			name: profiles.fullName,
			count: sql<number>`count(*)::int`
		})
		.from(leadActivities)
		.innerJoin(profiles, eq(profiles.id, leadActivities.actorId))
		.where(sql`${leadActivities.createdAt} >= now() - make_interval(days => ${days})`)
		.groupBy(profiles.fullName)
		.orderBy(desc(sql`count(*)::int`));

	return rows.map((r) => ({ name: r.name, count: r.count }));
}

export type FunnelRow = {
	stage: LeadStageValue;
	count: number;
	value: number;
	weighted: number;
};

/** Funnel per tahap + nilai terbobot. Dipakai laporan CSV dan UI. */
export async function pipelineFunnel(): Promise<FunnelRow[]> {
	const rows = await db
		.select({
			stage: leads.stage,
			count: sql<number>`count(*)::int`,
			value: sql<string>`coalesce(sum(${leads.estimatedValue}), 0)`
		})
		.from(leads)
		.where(inArray(leads.stage, ['PROSPEK', 'KONTAK', 'PROPOSAL', 'NEGOSIASI']))
		.groupBy(leads.stage);

	const byStage = new Map(rows.map((r) => [r.stage as LeadStageValue, r]));

	return (['PROSPEK', 'KONTAK', 'PROPOSAL', 'NEGOSIASI'] as const).map((stage) => {
		const r = byStage.get(stage);
		const value = toNumber(r?.value ?? 0);
		const weighted = value * (LEAD_STAGE_PROBABILITY[stage] / 100);
		return {
			stage,
			count: r?.count ?? 0,
			value,
			weighted
		};
	});
}

export type SourceRow = {
	source: string;
	count: number;
	win: number;
	value: number;
};

/**
 * Sumber mana yang paling sering menghasilkan order.
 *
 * `win` adalah lead dari sumber ini yang sudah MENANG; `value` total estimasi
 * yang sudah menang. Dipakai laporan "sumber terbaik".
 */
export async function bySource(): Promise<SourceRow[]> {
	const rows = await db
		.select({
			source: leads.source,
			count: sql<number>`count(*)::int`,
			win: sql<number>`count(*) filter (where ${leads.stage} = 'MENANG')::int`,
			winValue: sql<string>`coalesce(sum(case when ${leads.stage} = 'MENANG' then ${leads.estimatedValue} else 0 end), 0)`
		})
		.from(leads)
		.groupBy(leads.source)
		.orderBy(desc(sql`count(*)::int`));

	return rows.map((r) => ({ source: r.source, count: r.count, win: r.win, value: toNumber(r.winValue) }));
}

export type MonthlyProspectsRow = {
	month: string;
	count: number;
};

/** Tren prospek masuk per bulan, 12 bulan terakhir. */
export async function monthlyProspects(months = 12): Promise<MonthlyProspectsRow[]> {
	const rows = await db
		.select({
			month: sql<string>`to_char(${leads.createdAt}, 'YYYY-MM')`,
			count: sql<number>`count(*)::int`
		})
		.from(leads)
		.where(sql`${leads.createdAt} >= date_trunc('month', now()) - make_interval(months => ${months - 1})`)
		.groupBy(sql`to_char(${leads.createdAt}, 'YYYY-MM')`)
		.orderBy(asc(sql`to_char(${leads.createdAt}, 'YYYY-MM')`));

	return rows.map((r) => ({ month: r.month, count: r.count }));
}

export type OutreachStatsRow = {
	channel: string;
	sent: number;
	replied: number;
};

/** Statistik outreach per kanal — untuk label "saya mengirim ini itu hasil apa". */
export async function outreachStats(days = 30): Promise<OutreachStatsRow[]> {
	const rows = await db
		.select({
			channel: outreachLogs.channel,
			sent: sql<number>`count(*)::int`,
			replied: sql<number>`count(*) filter (where ${outreachLogs.replied})::int`
		})
		.from(outreachLogs)
		.where(sql`${outreachLogs.createdAt} >= now() - make_interval(days => ${days})`)
		.groupBy(outreachLogs.channel);

	return rows.map((r) => ({ channel: r.channel, sent: r.sent, replied: r.replied }));
}

/* -------------------------------------------------------------------------- */
/*                                    TEMPLATE                                */
/* -------------------------------------------------------------------------- */

const DEFAULT_TEMPLATES: Array<{ name: string; channel: 'WHATSAPP' | 'EMAIL'; body: string }> = [
	{
		name: 'Sapaan awal — naskah masuk',
		channel: 'WHATSAPP',
		body: 'Halo Kak {nama}, terima kasih sudah menghubungi Penerbit Bentala. Kami sudah membaca sinopsis “{judul}”. Boleh kami jadwalkan panggilan singkat 15 menit minggu ini untuk membahas paket penerbitan yang paling cocok?'
	},
	{
		name: 'Paket proposal',
		channel: 'WHATSAPP',
		body: 'Halo Kak {nama}, berikut rangkuman proposal “{judul}”:\n• Paket: {paket}\n• Estimasi nilai: {nilai}\n• Jatuh tempo DP: {jatuh_tempo}\n\nSilakan sampaikan pertanyaan apa pun. Kami siap sesuaikan fokus dengan kebutuhan Anda.'
	},
	{
		name: 'Follow-up 7 hari',
		channel: 'WHATSAPP',
		body: 'Halo Kak {nama}, ingin memastikan kabar proposal “{judul}”. Apakah ada pertanyaan yang belum terjawab, atau ada hal yang ingin ditinjau ulang?'
	},
	{
		name: 'Undangan meeting offline',
		channel: 'EMAIL',
		body: 'Halo Kak {nama},\n\nTerima kasih atas perhatian Anda untuk “{judul}”. Kami ingin mengajak Bapak/Ibu bertemu langsung untuk membahas detail paket {paket} (estimasi {nilai}, DP jatuh tempo {jatuh_tempo}).\n\nKapan waktu yang paling nyaman minggu ini?\n\nHormat kami,\nTim Penerbit Bentala'
	}
];

/**
 * Seed template.
 *
 * Dipanggil sekali saat migrasi, bukan tiap request (idempoten lewat
 * nama + kanal yang sudah ada). Luis di UI dapat menambah template baru.
 */
export async function seedTemplates(): Promise<void> {
	const existing = await db.select({ name: messageTemplates.name }).from(messageTemplates);
	const have = new Set(existing.map((r) => r.name));

	const missing = DEFAULT_TEMPLATES.filter((t) => !have.has(t.name));
	if (missing.length === 0) return;
	await db.insert(messageTemplates).values(missing.map((t) => ({ ...t })));
}
