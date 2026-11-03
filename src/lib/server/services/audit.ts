import { db } from '$db';
import { auditLogs } from '$db/schema';
import type { UserRole } from '$db/schema';

/**
 * Jejak aktivitas.
 *
 * Aturannya sederhana: catat aksi yang mengubah uang, status, atau isi karya.
 * Jangan catat pembacaan halaman. Audit yang terlalu berisik tidak dibaca
 * siapa pun, jadi nilainya nol.
 *
 * `recordAudit` sengaja tidak pernah melempar error. Kegagalan menulis jejak
 * tidak boleh membatalkan aksi bisnis yang sudah sah — tetapi juga tidak
 * ditelan diam-diam: ia dicatat ke konsol server.
 */

export type AuditEntityType =
	| 'invoice'
	| 'withdrawal'
	| 'project'
	| 'task'
	| 'revision'
	| 'print_run'
	| 'sale'
	| 'user'
	| 'order'
	| 'settings'
	| 'catalog'
	| 'file'
	| 'lead'
	| 'decision';

export type AuditChange = { from: unknown; to: unknown };

export type AuditInput = {
	actor: { id: string; fullName: string; role: UserRole } | null | undefined;
	action: string;
	entityType: AuditEntityType;
	entityId?: string | null;
	summary: string;
	changes?: Record<string, AuditChange> | null;
	context?: Record<string, unknown> | null;
	requestId?: string | null;
};

export async function recordAudit(input: AuditInput): Promise<void> {
	try {
		await db.insert(auditLogs).values({
			actorId: input.actor?.id ?? null,
			actorName: input.actor?.fullName ?? 'Sistem',
			actorRole: input.actor?.role ?? 'SYSTEM',
			action: input.action,
			entityType: input.entityType,
			entityId: input.entityId ?? null,
			summary: input.summary,
			changes: input.changes ?? null,
			context: input.context ?? null,
			requestId: input.requestId ?? null
		});
	} catch (e) {
		console.error('[audit] gagal mencatat jejak:', input.action, e);
	}
}

/** Label Indonesia untuk jenis entitas — dipakai timeline & filter. */
export const AUDIT_ENTITY_LABEL: Record<AuditEntityType, string> = {
	invoice: 'Invoice',
	withdrawal: 'Penarikan',
	project: 'Proyek',
	task: 'Task',
	revision: 'Revisi',
	print_run: 'Order Cetak',
	sale: 'Penjualan',
	user: 'Pengguna',
	order: 'Order',
	settings: 'Pengaturan',
	catalog: 'Katalog',
	file: 'Berkas',
	lead: 'Prospek',
	decision: 'Keputusan'
};

/**
 * Label aksi. Kunci memakai `entity.verb` supaya mudah difilter di halaman
 * audit; nilainya kalimat pendek yang langsung terbaca.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
	'invoice.paid': 'Pembayaran diverifikasi',
	'invoice.marked_overdue': 'Ditandai jatuh tempo',
	'invoice.voided': 'Invoice dibatalkan',
	'withdrawal.requested': 'Penarikan diajukan',
	'withdrawal.approved': 'Penarikan disetujui',
	'withdrawal.paid': 'Penarikan dibayar',
	'withdrawal.rejected': 'Penarikan ditolak',
	'project.specs_updated': 'Spesifikasi buku diubah',
	'order.created': 'Order dibuat',
	'order.cancelled': 'Order dibatalkan',
	'settings.updated': 'Pengaturan diubah',
	'catalog.package_saved': 'Paket katalog disimpan',
	'catalog.service_saved': 'Layanan katalog disimpan',
	'freelancer.created': 'Freelancer ditambahkan',
	'author.invited': 'Penulis diundang',
	'file.uploaded': 'Berkas diunggah',
	'task.assigned': 'Task ditugaskan',
	'task.submitted': 'Hasil task dikirim',
	'task.approved': 'Task disetujui',
	'task.approved_on_behalf': 'Disetujui atas nama penulis',
	'revision.requested': 'Revisi diminta',
	'print_run.created': 'Order cetak dibuat',
	'sale.recorded': 'Penjualan dicatat',
	'lead.created': 'Prospek Ditambahkan',
	'lead.updated': 'Data prospek diperbarui',
	'lead.stage_changed': 'Tahap pipeline diubah',
	'lead.won': 'Prospek menang, dikonversi ke penulis',
	'lead.lost': 'Prospek ditandai kalah',
	'lead.deleted': 'Prospek dihapus',
	'lead.activity_added': 'Aktivitas CRM dicatat',
	'template.saved': 'Template pesan disimpan',
	'decision.accepted': 'Rekomendasi dikerjakan',
	'decision.dismissed': 'Rekomendasi ditolak',
	'rules.updated': 'Ambang keputusan diubah',
	'scenario.saved': 'Skenario disimpan'
};
