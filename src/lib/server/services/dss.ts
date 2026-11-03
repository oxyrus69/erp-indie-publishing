import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$db';
import {
	bookProjects,
	bookSales,
	decisionLog,
	decisionRules,
	inventory,
	invoicePayments,
	invoices,
	orders,
	productionTasks,
	profiles,
	royaltyLedgers
} from '$db/schema';
import { toNumber } from './money';

/**
 * DSS — sistem pendukung keputusan.
 *
 * Kontraknya sengaja sempit supaya rekomendasi tidak berubah jadi hiasan:
 *
 *  1. **Tidak ada angka simpanan.** Semua penilaian dihitung dari baris nyata
 *     saat halaman dibuka. Skor yang disimpan berbohong begitu satu transaksi
 *     masuk, dan laporan yang berbohong lebih berbahaya daripada laporan kosong.
 *  2. **Setiap rekomendasi bisa dijelaskan.** `reason` menyebut fakta pemicunya
 *     dalam satu kalimat; `facts` menyimpan angkanya supaya jejak keputusan
 *     bisa dinilai ulang enam bulan kemudian.
 *  3. **Dampak dalam rupiah/eksemplar, bukan skor 0–100.** Skor abstrak tidak
 *     bisa diurutkan secara bisnis; rupiah bisa.
 *  4. **Ambang bisa diubah, rumus tidak.** Tim menggeser ambang lewat
 *     pengaturan; rumus margin dan HPP tetap satu-satunya di `printing.ts`.
 */

export type DecisionDomain = 'title' | 'cash' | 'production' | 'price';

export type Recommendation = {
	/** Kunci stabil: `domain:kind:entityId`. Dipakai untuk menolak duplikat. */
	key: string;
	domain: DecisionDomain;
	kind: string;
	title: string;
	entity: { type: string; id: string | null; label: string };
	/** Satu kalimat: fakta mana yang memicu rekomendasi ini. */
	reason: string;
	/** Angka yang dipakai saat memutuskan; disimpan di jejak. */
	facts: Record<string, unknown>;
	/** Dampak rupiah (0 bila dampaknya bukan uang, mis. eksemplar). */
	impact: number;
	impactLabel: string;
	/** Urgensi: 3 = uang berjalan/berhenti, 2 = minggu ini, 1 = pantau. */
	urgency: 1 | 2 | 3;
	/** Tindakan nyata yang bisa langsung dibuka. */
	action: { href: string; label: string } | null;
};

/* -------------------------------------------------------------------------- */
/*                              AMBANG KEPUTUSAN                              */
/* -------------------------------------------------------------------------- */

export type TitleRules = {
	/** Margin minimum sehat (% dari harga jual). Di bawah ini: naikkan harga. */
	minMarginPct: number;
	/** Stok dianggap kritis bila tersisa kurang dari N hari laju jual. */
	reorderCoverDays: number;
	/** Di bawah N eksemplar/bulan dianggap lambat laku. */
	slowMoverPerMonth: number;
	/** Modal yang tertahan di stok dianggap mengganggu di atas nilai ini. */
	deadStockValue: number;
};

export type CashRules = {
	/** Invoice dianggap berisiko setelah N hari lewat jatuh tempo. */
	overdueWarnDays: number;
	/** Konsentrasi piutang satu penulis di atas % ini = risiko terkumpul. */
	concentrationPct: number;
	/** Eksposur piutang yang membuat produksi baru disarankan ditahan. */
	holdProductionThreshold: number;
};

export type ProductionRules = {
	/** Task terbuka per orang di atas ini = kelebihan beban. */
	maxOpenTasks: number;
	/** Task tanpa gerak selama N hari dianggap macet. */
	staleTaskDays: number;
	/** Sisa hari sebelum deadline yang dianggap mendesak. */
	deadlineWarnDays: number;
};

export type DecisionSettings = {
	title: TitleRules;
	cash: CashRules;
	production: ProductionRules;
};

export const DEFAULT_DECISION: DecisionSettings = {
	title: {
		minMarginPct: 45,
		reorderCoverDays: 45,
		slowMoverPerMonth: 10,
		deadStockValue: 3_000_000
	},
	cash: {
		overdueWarnDays: 14,
		concentrationPct: 40,
		holdProductionThreshold: 15_000_000
	},
	production: {
		maxOpenTasks: 4,
		staleTaskDays: 10,
		deadlineWarnDays: 7
	}
};

/**
 * Membaca ambang dari `decision_rules`.
 *
 * Default tinggal di konstanta di atas, bukan hanya di database, supaya
 * perhitungan tetap lengkap sebelum tim pernah menyimpan pengaturan. Bentuk
 * penggabungannya dangkal per domain: menambah field baru tidak menghapus
 * field lama yang sudah disimpan.
 */
export async function getDecisionSettings(): Promise<DecisionSettings> {
	const rows = await db.select().from(decisionRules);
	const byKey = new Map(rows.map((row) => [row.key, row.value as Record<string, unknown>]));

	const merge = <T extends Record<string, unknown>>(base: T, override?: Record<string, unknown>): T =>
		override ? ({ ...base, ...override } as T) : base;

	return {
		title: merge(DEFAULT_DECISION.title, byKey.get('title')),
		cash: merge(DEFAULT_DECISION.cash, byKey.get('cash')),
		production: merge(DEFAULT_DECISION.production, byKey.get('production'))
	};
}

/** Menyimpan satu domain ambang. Dipanggil dari halaman pengaturan. */
export async function saveDecisionRules(
	domain: keyof DecisionSettings,
	value: Record<string, unknown>,
	actorId: string
): Promise<void> {
	await db
		.insert(decisionRules)
		.values({ key: domain, value, updatedBy: actorId })
		.onConflictDoUpdate({
			target: decisionRules.key,
			set: { value, updatedBy: actorId, updatedAt: new Date() }
		});
}

/* -------------------------------------------------------------------------- */
/*                              JUDUL / INVENTORY                             */
/* -------------------------------------------------------------------------- */

export type TitleFacts = {
	projectId: string;
	orderId: string;
	title: string;
	authorName: string;
	retailPrice: number;
	unitCost: number;
	marginPerCopy: number;
	marginPct: number;
	onHand: number;
	soldTotal: number;
	sold30: number;
	/** Eksemplar terjual per hari selama 30 hari terakhir. */
	dailyRate: number;
	/** Perkiraan hari sampai stok habis (null bila tidak ada penjualan). */
	daysOfStock: number | null;
	/** Modal tertahan di stok (stok × HPP). */
	stockValue: number;
	/** Eksemplar yang harus terjual agar HPP cetak tertutup. */
	/** Rasio harga jual terhadap HPP; < 2 berarti tipis menurut aturan penerbitan. */
	hasRealCost: boolean;
};

/**
 * Fakta per judul: satu query untuk inventori + proyek, satu query penjualan
 * 30 hari. Dijumlahkan di SQL, bukan di Node, supaya tetap murah saat katalog
 * bertambah.
 */
export async function titleFacts(): Promise<TitleFacts[]> {
	const rows = await db
		.select({
			projectId: bookProjects.id,
			orderId: orderIdOf(),
			title: bookProjects.title,
			authorName: bookProjects.authorName,
			retailPrice: inventory.retailPrice,
			unitCost: inventory.avgProductionCost,
			onHand: inventory.onHand,
			soldTotal: inventory.soldTotal
		})
		.from(inventory)
		.innerJoin(bookProjects, eq(bookProjects.id, inventory.projectId));

	if (rows.length === 0) return [];

	const ids = rows.map((row) => row.projectId);
	const recent = await db
		.select({
			projectId: bookSales.projectId,
			qty: sql<number>`coalesce(sum(${bookSales.quantity}), 0)::int`
		})
		.from(bookSales)
		.where(
			and(
				inArray(bookSales.projectId, ids),
				sql`${bookSales.soldAt} >= now() - make_interval(days => 30)`
			)
		)
		.groupBy(bookSales.projectId);

	const sold30By = new Map(recent.map((row) => [row.projectId, row.qty]));

	return rows.map((row) => {
		const retailPrice = toNumber(row.retailPrice);
		const unitCost = toNumber(row.unitCost);
		const sold30 = sold30By.get(row.projectId) ?? 0;
		const dailyRate = sold30 / 30;
		const marginPerCopy = retailPrice - unitCost;

		return {
			projectId: row.projectId,
			orderId: row.orderId,
			title: row.title,
			authorName: row.authorName,
			retailPrice,
			unitCost,
			marginPerCopy,
			marginPct: retailPrice > 0 ? Math.round((marginPerCopy / retailPrice) * 100) : 0,
			onHand: row.onHand,
			soldTotal: row.soldTotal,
			sold30,
			dailyRate,
			daysOfStock: dailyRate > 0 ? Math.round(row.onHand / dailyRate) : null,
			stockValue: Math.round(row.onHand * unitCost),
			hasRealCost: unitCost > 0 && retailPrice > 0
		};
	});
}

/** `orders.id` lewat join proyek — dipisah agar tipe select tetap terbaca. */
function orderIdOf() {
	return bookProjects.orderId;
}

/**
 * Rekomendasi judul: harga, cetak ulang, hentikan.
 *
 * Urutannya sengaja: stok kritis lebih mendesak daripada margin tipis, karena
 * kehabisan stok berarti kehilangan penjualan yang sudah ada pembelinya.
 */
export function titleRecommendations(facts: TitleFacts[], rules: TitleRules): Recommendation[] {
	const out: Recommendation[] = [];

	for (const fact of facts) {
		if (!fact.hasRealCost) continue;

		/* --------------------------- Stok akan habis --------------------------- */
		if (
			fact.daysOfStock !== null &&
			fact.daysOfStock <= rules.reorderCoverDays &&
			fact.sold30 >= rules.slowMoverPerMonth
		) {
			const reorderQty = Math.max(50, Math.ceil(fact.dailyRate * rules.reorderCoverDays * 1.5));
			out.push({
				key: `title:reorder:${fact.projectId}`,
				domain: 'title',
				kind: 'reorder',
				title: `Cetak ulang “${fact.title}”`,
				entity: { type: 'project', id: fact.projectId, label: fact.title },
				reason: `Stok ${fact.onHand} eksemplar, laku ${fact.sold30}/bulan — habis dalam ~${fact.daysOfStock} hari.`,
				facts: {
					onHand: fact.onHand,
					sold30: fact.sold30,
					dailyRate: Number(fact.dailyRate.toFixed(2)),
					daysOfStock: fact.daysOfStock,
					suggestedQty: reorderQty,
					unitCost: fact.unitCost
				},
				impact: Math.round(reorderQty * fact.marginPerCopy),
				impactLabel: `potensi margin ${reorderQty} eksemplar`,
				urgency: 3,
				action: { href: `/projects/${fact.projectId}`, label: 'Buka proyek & buat order cetak' }
			});
		}

		/* ---------------------------- Stok menumpuk ---------------------------- */
		if (
			fact.sold30 < rules.slowMoverPerMonth &&
			fact.stockValue >= rules.deadStockValue &&
			fact.onHand > 0
		) {
			out.push({
				key: `title:deadstock:${fact.projectId}`,
				domain: 'title',
				kind: 'dead_stock',
				title: `Modal tertahan di “${fact.title}”`,
				entity: { type: 'project', id: fact.projectId, label: fact.title },
				reason: `${fact.onHand} eksemplar menumpuk (Rp ${fact.stockValue.toLocaleString('id-ID')} modal) sementara hanya laku ${fact.sold30}/bulan.`,
				facts: {
					onHand: fact.onHand,
					sold30: fact.sold30,
					stockValue: fact.stockValue,
					unitCost: fact.unitCost
				},
				impact: fact.stockValue,
				impactLabel: 'modal tertahan',
				urgency: 2,
				action: { href: `/admin/katalog`, label: 'Tinjau harga & promosi' }
			});
		}

		/* ---------------------------- Margin tipis ----------------------------- */
		if (fact.marginPct < rules.minMarginPct && fact.marginPerCopy > 0) {
			/* Harga minimum agar margin tepat di ambang. */
			const targetPrice =
				rules.minMarginPct < 100
					? Math.ceil(fact.unitCost / (1 - rules.minMarginPct / 100))
					: fact.retailPrice;
			out.push({
				key: `title:margin:${fact.projectId}`,
				domain: 'title',
				kind: 'thin_margin',
				title: `Margin “${fact.title}” di bawah ambang`,
				entity: { type: 'project', id: fact.projectId, label: fact.title },
				reason: `Margin ${fact.marginPct}% (Rp ${fact.marginPerCopy.toLocaleString('id-ID')}/eksemplar), ambang ${rules.minMarginPct}%.`,
				facts: {
					retailPrice: fact.retailPrice,
					unitCost: fact.unitCost,
					marginPerCopy: fact.marginPerCopy,
					marginPct: fact.marginPct,
					minMarginPct: rules.minMarginPct,
					targetPrice
				},
				impact: Math.round((targetPrice - fact.retailPrice) * Math.max(fact.sold30, 1)),
				impactLabel: 'potensi kenaikan margin/bulan',
				urgency: fact.marginPerCopy <= 0 ? 3 : 2,
				action: { href: `/dss/judul`, label: 'Simulasikan harga baru' }
			});
		}
	}

	return out;
}

/* -------------------------------------------------------------------------- */
/*                                    KAS                                     */
/* -------------------------------------------------------------------------- */

export type ReceivableFacts = {
	invoiceId: string;
	invoiceNumber: string;
	orderId: string;
	orderNumber: string;
	authorId: string;
	authorName: string;
	amount: number;
	outstanding: number;
	dueDate: string | null;
	/** Hari lewat jatuh tempo; negatif = belum jatuh tempo. */
	overdueDays: number;
	/** Riwayat: berapa kali penulis ini terlambat pada invoice lain. */
	lateHistory: number;
};

/**
 * Piutang terbuka + riwayat keterlambatan penulisnya.
 *
 * Riwayat dihitung sekali per penulis (bukan per invoice) lalu ditempelkan:
 * penulis yang selalu tepat waktu layak diperlakukan berbeda dari yang sudah
 * tiga kali lewat tenggat, dan itu bagian dari keputusan menagih.
 */
export async function receivableFacts(): Promise<ReceivableFacts[]> {
	const rows = await db
		.select({
			invoiceId: invoices.id,
			invoiceNumber: invoices.invoiceNumber,
			orderId: orders.id,
			orderNumber: orders.orderNumber,
			authorId: orders.authorId,
			authorName: profiles.fullName,
			amount: invoices.amount,
			paidAmount: invoices.paidAmount,
			dueDate: invoices.dueDate
		})
		.from(invoices)
		.innerJoin(orders, eq(orders.id, invoices.orderId))
		.innerJoin(profiles, eq(profiles.id, orders.authorId))
		.where(sql`${invoices.status} not in ('VOID','PAID')`);

	if (rows.length === 0) return [];

	const authorIds = [...new Set(rows.map((row) => row.authorId))];
	const late = await db
		.select({
			authorId: orders.authorId,
			lateCount: sql<number>`count(*)::int`
		})
		.from(invoices)
		.innerJoin(orders, eq(orders.id, invoices.orderId))
		.where(
			and(
				inArray(orders.authorId, authorIds),
				sql`${invoices.dueDate} is not null and ${invoices.dueDate} < current_date and ${invoices.status} not in ('VOID','PAID')`
			)
		)
		.groupBy(orders.authorId);

	const lateBy = new Map(late.map((row) => [row.authorId, row.lateCount]));

	return rows.map((row) => {
		const outstanding = Math.max(0, toNumber(row.amount) - toNumber(row.paidAmount));
		const overdueDays = row.dueDate
			? Math.floor(
					(Date.now() - new Date(`${row.dueDate}T23:59:59`).getTime()) / 86_400_000
				)
			: 0;

		return {
			invoiceId: row.invoiceId,
			invoiceNumber: row.invoiceNumber,
			orderId: row.orderId,
			orderNumber: row.orderNumber,
			authorId: row.authorId,
			authorName: row.authorName,
			amount: toNumber(row.amount),
			outstanding,
			dueDate: row.dueDate,
			overdueDays,
			lateHistory: lateBy.get(row.authorId) ?? 0
		};
	});
}

/**
 * Rekomendasi penagihan.
 *
 * Skor sengaja dibuat dari tiga hal yang bisa dijelaskan — umur, nilai, dan
 * riwayat — bukan bobot tersembunyi. `impact` = rupiah yang bisa masuk, jadi
 * urutan daftar berarti "tagih yang ini dulu karena paling besar dan paling
 * lama".
 */
export function cashRecommendations(facts: ReceivableFacts[], rules: CashRules): Recommendation[] {
	const ripe = facts.filter((fact) => fact.overdueDays >= rules.overdueWarnDays && fact.outstanding > 0);

	return ripe.map((fact) => ({
		key: `cash:collect:${fact.invoiceId}`,
		domain: 'cash' as const,
		kind: 'collect',
		title: `Tagih ${fact.invoiceNumber}`,
		entity: { type: 'invoice', id: fact.invoiceId, label: fact.invoiceNumber },
		reason: `Lewat ${fact.overdueDays} hari, sisa Rp ${Math.round(fact.outstanding).toLocaleString('id-ID')}. ${fact.lateHistory > 1 ? `Penulis ini sudah ${fact.lateHistory} invoice lewat tenggat.` : 'Riwayat penulis belum pernah telat.'}`,
		facts: {
			invoiceNumber: fact.invoiceNumber,
			orderNumber: fact.orderNumber,
			authorName: fact.authorName,
			outstanding: fact.outstanding,
			overdueDays: fact.overdueDays,
			lateHistory: fact.lateHistory
		},
		impact: Math.round(fact.outstanding),
		impactLabel: 'piutang bisa masuk',
		urgency: fact.overdueDays >= rules.overdueWarnDays * 3 ? 3 : 2,
		action: { href: `/admin/finance?tab=receivables&bucket=overdue`, label: 'Buka piutang' }
	}));
}

export type ConcentrationRisk = {
	authorId: string;
	authorName: string;
	outstanding: number;
	sharePct: number;
};

/** Konsentrasi piutang per penulis — satu penulis menahan arus kas. */
export function concentrationRisk(facts: ReceivableFacts[], rules: CashRules): ConcentrationRisk[] {
	const total = facts.reduce((sum, fact) => sum + fact.outstanding, 0);
	if (total === 0) return [];

	const byAuthor = new Map<string, { authorName: string; outstanding: number }>();
	for (const fact of facts) {
		const current = byAuthor.get(fact.authorId) ?? {
			authorName: fact.authorName,
			outstanding: 0
		};
		current.outstanding += fact.outstanding;
		byAuthor.set(fact.authorId, current);
	}

	return [...byAuthor.entries()]
		.map(([authorId, value]) => ({
			authorId,
			authorName: value.authorName,
			outstanding: value.outstanding,
			sharePct: Math.round((value.outstanding / total) * 100)
		}))
		.filter((row) => row.sharePct >= rules.concentrationPct)
		.sort((a, b) => b.outstanding - a.outstanding);
}

/* -------------------------------------------------------------------------- */
/*                                  PRODUKSI                                  */
/* -------------------------------------------------------------------------- */

export type TrackLoad = {
	track: string;
	open: number;
	review: number;
	/** Hari sejak task tertua di track ini dibuat. */
	oldestDays: number;
};

export async function trackLoads(): Promise<TrackLoad[]> {
	const rows = await db
		.select({
			track: productionTasks.track,
			open: sql<number>`count(*) filter (where ${productionTasks.status} in ('PENDING','IN_PROGRESS'))::int`,
			review: sql<number>`count(*) filter (where ${productionTasks.status} = 'WAITING_AUTHOR_REVIEW')::int`,
			oldest: sql<string | null>`min(${productionTasks.createdAt}) filter (where ${productionTasks.status} in ('PENDING','IN_PROGRESS'))`
		})
		.from(productionTasks)
		.groupBy(productionTasks.track);

	return rows.map((row) => ({
		track: row.track,
		open: row.open,
		review: row.review,
		oldestDays: row.oldest
			? Math.max(0, Math.floor((Date.now() - new Date(row.oldest).getTime()) / 86_400_000))
			: 0
	}));
}

export type StaleTask = {
	taskId: string;
	projectId: string;
	title: string;
	projectTitle: string;
	track: string;
	status: string;
	assigneeName: string | null;
	daysIdle: number;
};

export async function staleTasks(rules: ProductionRules): Promise<StaleTask[]> {
	const rows = await db
		.select({
			taskId: productionTasks.id,
			projectId: productionTasks.projectId,
			title: productionTasks.title,
			projectTitle: bookProjects.title,
			track: productionTasks.track,
			status: productionTasks.status,
			assigneeName: profiles.fullName,
			updatedAt: productionTasks.updatedAt
		})
		.from(productionTasks)
		.innerJoin(bookProjects, eq(bookProjects.id, productionTasks.projectId))
		.leftJoin(profiles, eq(profiles.id, productionTasks.assigneeId))
		.where(sql`${productionTasks.status} in ('PENDING','IN_PROGRESS')`);

	return rows
		.map((row) => ({
			taskId: row.taskId,
			projectId: row.projectId,
			title: row.title,
			projectTitle: row.projectTitle,
			track: row.track,
			status: row.status,
			assigneeName: row.assigneeName,
			daysIdle: Math.max(
				0,
				Math.floor((Date.now() - new Date(row.updatedAt).getTime()) / 86_400_000)
			)
		}))
		.filter((row) => row.daysIdle >= rules.staleTaskDays)
		.sort((a, b) => b.daysIdle - a.daysIdle);
}

export type FreelancerLoadRow = {
	userId: string;
	fullName: string;
	openTasks: number;
	completed30: number;
};

export async function freelancerLoads(rules: ProductionRules): Promise<FreelancerLoadRow[]> {
	const rows = await db
		.select({
			userId: profiles.id,
			fullName: profiles.fullName,
			openTasks: sql<number>`count(${productionTasks.id}) filter (where ${productionTasks.status} in ('PENDING','IN_PROGRESS'))::int`,
			completed30: sql<number>`count(${productionTasks.id}) filter (where ${productionTasks.status} = 'COMPLETED' and ${productionTasks.updatedAt} >= now() - make_interval(days => 30))::int`
		})
		.from(profiles)
		.leftJoin(productionTasks, eq(productionTasks.assigneeId, profiles.id))
		.where(and(eq(profiles.role, 'FREELANCER'), eq(profiles.isActive, true)))
		.groupBy(profiles.id, profiles.fullName)
		.orderBy(desc(sql`count(${productionTasks.id}) filter (where ${productionTasks.status} in ('PENDING','IN_PROGRESS'))`));

	return rows.map((row) => ({ ...row }));
}

export type DeadlineRisk = {
	projectId: string;
	title: string;
	orderNumber: string;
	contractValue: number;
	deadline: string;
	daysLeft: number;
	openTasks: number;
};

export async function deadlineRisks(rules: ProductionRules): Promise<DeadlineRisk[]> {
	const rows = await db
		.select({
			projectId: bookProjects.id,
			title: bookProjects.title,
			orderNumber: orders.orderNumber,
			contractValue: orders.totalAmount,
			deadline: sql<string>`min(${productionTasks.deadline})`
		})
		.from(bookProjects)
		.innerJoin(orders, eq(orders.id, bookProjects.orderId))
		.innerJoin(productionTasks, eq(productionTasks.projectId, bookProjects.id))
		.where(
			sql`${productionTasks.deadline} is not null
				and ${productionTasks.status} not in ('COMPLETED','CANCELLED')
				and ${bookProjects.status} not in ('PUBLISHED','COMPLETED','CANCELLED')`
		)
		.groupBy(bookProjects.id, bookProjects.title, orders.orderNumber, orders.totalAmount);

	if (rows.length === 0) return [];

	const openCounts = await db
		.select({
			projectId: productionTasks.projectId,
			open: sql<number>`count(*)::int`
		})
		.from(productionTasks)
		.where(sql`${productionTasks.status} not in ('COMPLETED','CANCELLED')`)
		.groupBy(productionTasks.projectId);

	const openBy = new Map(openCounts.map((row) => [row.projectId, row.open]));

	return rows
		.map((row) => ({
			projectId: row.projectId,
			title: row.title,
			orderNumber: row.orderNumber,
			contractValue: toNumber(row.contractValue),
			deadline: row.deadline,
			daysLeft: Math.floor(
				(new Date(`${row.deadline}T23:59:59`).getTime() - Date.now()) / 86_400_000
			),
			openTasks: openBy.get(row.projectId) ?? 0
		}))
		.filter((row) => row.daysLeft <= rules.deadlineWarnDays)
		.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function productionRecommendations(input: {
	stale: StaleTask[];
	deadlines: DeadlineRisk[];
	loads: FreelancerLoadRow[];
	tracks: TrackLoad[];
	rules: ProductionRules;
}): Recommendation[] {
	const out: Recommendation[] = [];

	for (const risk of input.deadlines) {
		out.push({
			key: `production:deadline:${risk.projectId}`,
			domain: 'production',
			kind: 'deadline',
			title: `Deadline “${risk.title}” ${risk.daysLeft < 0 ? 'sudah lewat' : 'mepet'}`,
			entity: { type: 'project', id: risk.projectId, label: risk.title },
			reason:
				risk.daysLeft < 0
					? `Lewat ${Math.abs(risk.daysLeft)} hari, masih ${risk.openTasks} task terbuka.`
					: `Sisa ${risk.daysLeft} hari, masih ${risk.openTasks} task terbuka.`,
			facts: {
				orderNumber: risk.orderNumber,
				deadline: risk.deadline,
				daysLeft: risk.daysLeft,
				openTasks: risk.openTasks,
				contractValue: risk.contractValue
			},
			impact: Math.round(risk.contractValue),
			impactLabel: 'nilai kontrak berisiko',
			urgency: risk.daysLeft < 0 ? 3 : 2,
			action: { href: `/projects/${risk.projectId}`, label: 'Buka proyek' }
		});
	}

	const crowded = input.loads.filter((row) => row.openTasks > input.rules.maxOpenTasks);
	for (const row of crowded) {
		out.push({
			key: `production:overload:${row.userId}`,
			domain: 'production',
			kind: 'overload',
			title: `${row.fullName} kelebihan beban`,
			entity: { type: 'profile', id: row.userId, label: row.fullName },
			reason: `${row.openTasks} task terbuka (batas ${input.rules.maxOpenTasks}), ${row.completed30} selesai dalam 30 hari.`,
			facts: { openTasks: row.openTasks, completed30: row.completed30, maxOpenTasks: input.rules.maxOpenTasks },
			impact: 0,
			impactLabel: 'risiko keterlambatan',
			urgency: row.openTasks > input.rules.maxOpenTasks * 2 ? 3 : 2,
			action: { href: '/admin/freelancer', label: 'Atur penugasan' }
		});
	}

	for (const task of input.stale.slice(0, 5)) {
		out.push({
			key: `production:stale:${task.taskId}`,
			domain: 'production',
			kind: 'stale',
			title: `“${task.title}” tidak bergerak — ${task.projectTitle}`,
			entity: { type: 'task', id: task.taskId, label: task.title },
			reason: `${task.daysIdle} hari tanpa perubahan status${task.assigneeName ? `, dipegang ${task.assigneeName}` : ''}.`,
			facts: {
				projectTitle: task.projectTitle,
				track: task.track,
				status: task.status,
				daysIdle: task.daysIdle
			},
			impact: 0,
			impactLabel: 'menahan track berikutnya',
			urgency: 1,
			action: { href: `/projects/${task.projectId}`, label: 'Buka proyek' }
		});
	}

	return out;
}

/* -------------------------------------------------------------------------- */
/*                              GABUNGAN & JEJAK                               */
/* -------------------------------------------------------------------------- */

export type DecisionSummary = {
	open: number;
	openImpact: number;
	acceptedThisWeek: number;
	dismissedThisWeek: number;
	acceptRate: number | null;
};

export async function decisionSummary(): Promise<DecisionSummary> {
	const [row] = await db
		.select({
			accepted: sql<number>`count(*) filter (where ${decisionLog.verdict} = 'ACCEPTED' and ${decisionLog.createdAt} >= now() - make_interval(days => 7))::int`,
			dismissed: sql<number>`count(*) filter (where ${decisionLog.verdict} = 'DISMISSED' and ${decisionLog.createdAt} >= now() - make_interval(days => 7))::int`
		})
		.from(decisionLog);

	const accepted = row?.accepted ?? 0;
	const dismissed = row?.dismissed ?? 0;
	const total = accepted + dismissed;

	return {
		open: 0,
		openImpact: 0,
		acceptedThisWeek: accepted,
		dismissedThisWeek: dismissed,
		acceptRate: total > 0 ? Math.round((accepted / total) * 100) : null
	};
}

/**
 * Menggabungkan rekomendasi semua domain lalu mengurutkan berdasarkan dampak.
 *
 * Urgensi lebih dulu, dampak kedua: rekomendasi yang menyangkut uang berjalan
 * tidak boleh kalah dari nominal besar yang masih bisa menunggu. Keputusan yang
 * sudah pernah diambil (diterima/ditolak) dalam 14 hari terakhir disembunyikan
 * supaya daftar tidak berisi hal yang sama setiap hari.
 */
export async function allRecommendations(): Promise<{
	items: Recommendation[];
	rules: DecisionSettings;
	decided: Map<string, 'ACCEPTED' | 'DISMISSED'>;
}> {
	const rules = await getDecisionSettings();

	const [titleData, receivable, trains, stale, freelancers, deadlines, recentlyDecided] =
		await Promise.all([
			titleFacts(),
			receivableFacts(),
			trackLoads(),
			staleTasks(rules.production),
			freelancerLoads(rules.production),
			deadlineRisks(rules.production),
			db
				.select({ ruleKey: decisionLog.ruleKey, verdict: decisionLog.verdict })
				.from(decisionLog)
				.where(sql`${decisionLog.createdAt} >= now() - make_interval(days => 14)`)
				.orderBy(desc(decisionLog.createdAt))
		]);

	const decided = new Map<string, 'ACCEPTED' | 'DISMISSED'>();
	for (const row of recentlyDecided) {
		if (!decided.has(row.ruleKey)) decided.set(row.ruleKey, row.verdict);
	}

	const items = [
		...titleRecommendations(titleData, rules.title),
		...cashRecommendations(receivable, rules.cash),
		...productionRecommendations({
			stale,
			deadlines,
			loads: freelancers,
			tracks: trains,
			rules: rules.production
		})
	].sort((a, b) => b.urgency - a.urgency || b.impact - a.impact);

	return { items, rules, decided };
}

/** Mencatat keputusan. Satu baris per rekomendasi yang diputuskan. */
export async function recordDecision(input: {
	recommendation: Recommendation;
	verdict: 'ACCEPTED' | 'DISMISSED';
	note?: string | null;
	actorId: string;
}): Promise<void> {
	const { recommendation: rec } = input;
	await db.insert(decisionLog).values({
		ruleKey: rec.key,
		domain: rec.domain,
		entityType: rec.entity.type,
		entityId: rec.entity.id,
		verdict: input.verdict,
		title: rec.title,
		summary: rec.reason,
		impactValue: String(Math.max(0, Math.round(rec.impact))),
		note: input.note?.trim() || null,
		facts: rec.facts,
		actorId: input.actorId
	});
}

export type DecisionHistoryRow = {
	id: string;
	ruleKey: string;
	domain: string;
	verdict: 'ACCEPTED' | 'DISMISSED';
	title: string;
	summary: string;
	impactValue: number;
	note: string | null;
	actorName: string | null;
	createdAt: Date;
};

export async function decisionHistory(limit = 50): Promise<DecisionHistoryRow[]> {
	const rows = await db
		.select({
			id: decisionLog.id,
			ruleKey: decisionLog.ruleKey,
			domain: decisionLog.domain,
			verdict: decisionLog.verdict,
			title: decisionLog.title,
			summary: decisionLog.summary,
			impactValue: decisionLog.impactValue,
			note: decisionLog.note,
			actorName: profiles.fullName,
			createdAt: decisionLog.createdAt
		})
		.from(decisionLog)
		.leftJoin(profiles, eq(profiles.id, decisionLog.actorId))
		.orderBy(desc(decisionLog.createdAt))
		.limit(limit);

	return rows.map((row) => ({ ...row, impactValue: toNumber(row.impactValue) }));
}
