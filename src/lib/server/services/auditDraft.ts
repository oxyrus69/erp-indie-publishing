/**
 * Helper penyusun jejak audit untuk aksi yang sering terjadi.
 *
 * Dipisah dari `audit.ts` supaya route handler tidak menulis objek panjang
 * berulang-ulang — dan supaya ringkasan yang dibaca pengguna konsisten di
 * semua tempat aksi itu dipicu.
 */
import { recordAudit, type AuditChange, type AuditEntityType } from '$lib/server/services/audit';
import type { Profile } from '$db/schema';

type Actor = Pick<Profile, 'id' | 'fullName' | 'role'> | null | undefined;

/** Bandingkan dua nilai dan kembalikan hanya yang benar-benar berubah. */
export function diff<T extends Record<string, unknown>>(
	before: T,
	after: Partial<T>
): Record<string, AuditChange> | null {
	const changes: Record<string, AuditChange> = {};
	for (const [key, next] of Object.entries(after)) {
		const prev = before[key];
		if (String(prev ?? '') !== String(next ?? '')) {
			changes[key] = { from: prev ?? null, to: next ?? null };
		}
	}
	return Object.keys(changes).length > 0 ? changes : null;
}

export type AuditDraft = {
	actor: Actor;
	action: string;
	entityType: AuditEntityType;
	entityId?: string | null;
	summary: string;
	changes?: Record<string, AuditChange> | null;
	context?: Record<string, unknown> | null;
	requestId?: string | null;
};

/** `recordAudit` dengan toleransi aktor null (mis. job sistem). */
export async function audit(draft: AuditDraft): Promise<void> {
	await recordAudit({
		actor: draft.actor ?? null,
		action: draft.action,
		entityType: draft.entityType,
		entityId: draft.entityId ?? null,
		summary: draft.summary,
		changes: draft.changes ?? null,
		context: draft.context ?? null,
		requestId: draft.requestId ?? null
	});
}
