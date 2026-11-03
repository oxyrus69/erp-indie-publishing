import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$db';
import { auditLogs, bookProjects } from '$db/schema';
import { AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL } from '$lib/server/services/audit';
import { finalizeTableQuery, parseTableQuery } from '$lib/table/query';
import { parsePeriod } from '$lib/table/period';
import type { PageServerLoad } from './$types';

const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'] as const;

/** Kolom pengurutan jejak: nama logis → ekspresi SQL. */
const AUDIT_SORT = {
	created: auditLogs.createdAt,
	action: auditLogs.action,
	entity: auditLogs.entityType,
	actor: auditLogs.actorName
} as const;

/**
 * Jejak aktivitas.
 *
 * Halaman ini menjawab pertanyaan yang tidak bisa dijawab kolom `updated_at`:
 * "siapa mengubah spesifikasi cetak ini dan kapan". Setiap baris memuat pelaku
 * (snapshot nama + peran), aksi, entitas, ringkasan, dan diff nilai bila ada.
 *
 * Dibatasi untuk tim internal: jejak finansial bukan informasi untuk penulis
 * atau freelancer.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
		error(403, 'Jejak aktivitas hanya untuk tim internal.');
	}

	const period = parsePeriod(url);

	const parsed = parseTableQuery(url, {
		sortable: Object.keys(AUDIT_SORT),
		defaultSort: 'created',
		defaultDir: 'desc',
		filterOptions: {
			entity: ['invoice', 'withdrawal', 'project', 'task', 'revision', 'print_run', 'sale', 'user']
		}
	});

	const sortColumn =
		AUDIT_SORT[parsed.sort as keyof typeof AUDIT_SORT] ?? AUDIT_SORT.created;

	const conditions: SQL[] = [];
	if (period.from) conditions.push(sql`${auditLogs.createdAt} >= ${period.from}::date`);
	if (period.to) conditions.push(sql`${auditLogs.createdAt} < (${period.to}::date + interval '1 day')`);
	if (parsed.filters.entity) {
		conditions.push(eq(auditLogs.entityType, parsed.filters.entity));
	}
	if (parsed.q) {
		const pattern = `%${parsed.q}%`;
		conditions.push(
			sql`(${auditLogs.summary} ilike ${pattern} or ${auditLogs.actorName} ilike ${pattern})`
		);
	}

	const where = conditions.length > 0 ? sql.join(conditions, sql` and `) : undefined;

	const [rows, countRows] = await Promise.all([
		db
			.select({
				id: auditLogs.id,
				actorName: auditLogs.actorName,
				actorRole: auditLogs.actorRole,
				action: auditLogs.action,
				entityType: auditLogs.entityType,
				entityId: auditLogs.entityId,
				summary: auditLogs.summary,
				changes: auditLogs.changes,
				context: auditLogs.context,
				createdAt: auditLogs.createdAt
			})
			.from(auditLogs)
			.where(where)
			.orderBy(
				parsed.dir === 'asc' ? asc(sortColumn) : desc(sortColumn),
				desc(auditLogs.createdAt)
			)
			.limit(parsed.size)
			.offset((parsed.page - 1) * parsed.size),

		db
			.select({ total: sql<number>`count(*)::int` })
			.from(auditLogs)
			.where(where)
	]);

	/*
	 * Judul proyek untuk konteks: jejak "project/specs_updated" tanpa nama buku
	 * sulit ditelusuri. Diambil sekaligus untuk semua id di halaman ini.
	 */
	const projectIds = rows
		.filter((row) => row.entityType === 'project' && row.entityId)
		.map((row) => row.entityId as string);

	const projectTitles = projectIds.length
		? await db
				.select({ id: bookProjects.id, title: bookProjects.title })
				.from(bookProjects)
				.where(inArray(bookProjects.id, projectIds))
		: [];

	const titleById = new Map(projectTitles.map((p) => [p.id, p.title]));

	return {
		entries: rows.map((row) => ({
			...row,
			actionLabel: AUDIT_ACTION_LABEL[row.action] ?? row.action,
			entityLabel: AUDIT_ENTITY_LABEL[row.entityType as keyof typeof AUDIT_ENTITY_LABEL] ?? row.entityType,
			projectTitle: row.entityId ? (titleById.get(row.entityId) ?? null) : null
		})),
		query: finalizeTableQuery(parsed, countRows[0]?.total ?? 0),
		period
	};
};
