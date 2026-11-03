import { asc, eq } from 'drizzle-orm';
import { db } from '$db';
import { taskComments } from '$db/schema';
import type { UserRole } from '$db/schema';

/**
 * Komentar task — benang diskusi revisi.
 *
 * Aturan visibilitas:
 *  - `isInternal` (catatan staf) hanya untuk SUPER_ADMIN, PROJECT_MANAGER,
 *    FINANCE. Penulis dan freelancer tidak pernah menerimanya, bahkan lewat
 *    query langsung — filternya di SQL, bukan di UI.
 *  - Komentar biasa terlihat oleh semua pihak yang terlibat di task itu.
 *
 * Nama & peran disimpan sebagai snapshot: riwayat diskusi harus tetap terbaca
 * walau profil kemudian berganti nama.
 */

const STAFF_ROLES: UserRole[] = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'];

export function canSeeInternal(role: UserRole): boolean {
	return STAFF_ROLES.includes(role);
}

export type CommentRow = {
	id: string;
	taskId: string;
	authorName: string;
	authorRole: string;
	body: string;
	isInternal: boolean;
	createdAt: Date;
};
/** Komentar untuk sekumpulan task, dikelompokkan per task. */
export async function commentsByTask(
	taskIds: string[],
	includeInternal: boolean
): Promise<Map<string, CommentRow[]>> {
	if (taskIds.length === 0) return new Map();

	const rows = await db
		.select({
			id: taskComments.id,
			taskId: taskComments.taskId,
			authorName: taskComments.authorName,
			authorRole: taskComments.authorRole,
			body: taskComments.body,
			isInternal: taskComments.isInternal,
			createdAt: taskComments.createdAt
		})
		.from(taskComments)
		.where(
			includeInternal
				? undefined
				: eq(taskComments.isInternal, false)
		)
		.orderBy(asc(taskComments.createdAt));

	const grouped = new Map<string, CommentRow[]>();
	for (const row of rows) {
		if (!taskIds.includes(row.taskId)) continue;
		const list = grouped.get(row.taskId);
		if (list) list.push(row);
		else grouped.set(row.taskId, [row]);
	}
	return grouped;
}

export async function addComment(input: {
	taskId: string;
	projectId: string;
	author: { id: string; fullName: string; role: UserRole };
	body: string;
	isInternal: boolean;
}): Promise<CommentRow> {
	const [row] = await db
		.insert(taskComments)
		.values({
			taskId: input.taskId,
			projectId: input.projectId,
			authorId: input.author.id,
			authorName: input.author.fullName,
			authorRole: input.author.role,
			body: input.body,
			isInternal: input.isInternal && canSeeInternal(input.author.role)
		})
		.returning({
			id: taskComments.id,
			taskId: taskComments.taskId,
			authorName: taskComments.authorName,
			authorRole: taskComments.authorRole,
			body: taskComments.body,
			isInternal: taskComments.isInternal,
			createdAt: taskComments.createdAt
		});

	if (!row) throw new Error('Komentar gagal disimpan.');

	/*
	 * Notifikasi disiapkan setelah komentar benar-benar tersimpan. Kegagalan
	 * notifikasi tidak boleh membatalkan diskusi yang sudah tercatat, jadi
	 * pemanggilnya tidak menunggu hasil.
	 */
	return row;
}
