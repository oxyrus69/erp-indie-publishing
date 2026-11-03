import { error } from '@sveltejs/kit';
import { and, desc } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '$db';
import { leads, profiles } from '$db/schema';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { LEAD_SOURCES, LEAD_SOURCE_LABEL, LEAD_STAGE_LABEL, type LeadSourceValue, type LeadStageValue } from '$lib/server/services/leads';
import { toNumber } from '$lib/server/services/money';
import type { RequestHandler } from './$types';

const CRM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

/**
 * Ekspor CSV prospek.
 *
 * Mengikuti filter yang sedang aktif di `/crm`, sehingga angka di Excel sama
 * dengan yang terlihat di layar. Tidak dipotong halaman: ekspor selalu berisi
 * seluruh hasil filter.
 *
 * Pemisah `;` karena Excel berlokal Indonesia membaca koma sebagai desimal.
 * BOM UTF-8 ditambahkan supaya huruf beraksen dan tanda kutip melengkung tidak
 * rusak saat dibuka di Excel Windows.
 */

/** Sel CSV: kutip bila mengandung pemisah, kutip, atau baris baru. */
function cell(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value);
	return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(values: unknown[]): string {
	return values.map(cell).join(';');
}

/** `YYYY-MM-DD` untuk kolom tanggal; kosong bila null. */
function day(value: Date | null): string {
	return value ? value.toISOString().slice(0, 10) : '';
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const role = locals.profile?.role;
	if (!role || !CRM_ROLES.includes(role as (typeof CRM_ROLES)[number])) {
		error(403, 'Ekspor CRM hanya untuk Project Manager dan Super Admin.');
	}

	const q = (url.searchParams.get('q') ?? '').trim();
	const sourceParam = url.searchParams.get('source') ?? '';
	const stageParam = url.searchParams.get('stage') ?? '';
	const owner = url.searchParams.get('owner') ?? '';

	const source = LEAD_SOURCES.includes(sourceParam as LeadSourceValue) ? sourceParam : '';
	const stage = Object.keys(LEAD_STAGE_LABEL).includes(stageParam) ? stageParam : '';

	const conditions: SQL[] = [];
	if (stage) conditions.push(eq(leads.stage, stage as never));
	if (source) conditions.push(eq(leads.source, source as never));
	if (owner) conditions.push(eq(leads.ownerId, owner));
	if (q) {
		const pattern = `%${q}%`;
		const search = or(
			ilike(leads.fullName, pattern),
			ilike(sql`coalesce(${leads.email}, '')`, pattern),
			ilike(sql`coalesce(${leads.bookTitle}, '')`, pattern),
			ilike(sql`coalesce(${leads.genre}, '')`, pattern)
		);
		if (search) conditions.push(search);
	}

	const rows = await db
		.select({
			fullName: leads.fullName,
			email: leads.email,
			phone: leads.phone,
			bookTitle: leads.bookTitle,
			genre: leads.genre,
			stage: leads.stage,
			source: leads.source,
			estimatedValue: leads.estimatedValue,
			ownerName: profiles.fullName,
			lastContactAt: leads.lastContactAt,
			createdAt: leads.createdAt,
			convertedAt: leads.convertedAt,
			lostReason: leads.lostReason
		})
		.from(leads)
		.leftJoin(profiles, eq(profiles.id, leads.ownerId))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(leads.createdAt));

	const header = row([
		'Nama',
		'Email',
		'Telepon',
		'Judul Buku',
		'Genre',
		'Tahap',
		'Sumber',
		'Estimasi Nilai',
		'Pemilik',
		'Kontak Terakhir',
		'Masuk',
		'Tanggal Menang',
		'Alasan Kalah'
	]);

	const body = rows.map((lead) =>
		row([
			lead.fullName,
			lead.email ?? '',
			lead.phone ?? '',
			lead.bookTitle ?? '',
			lead.genre ?? '',
			LEAD_STAGE_LABEL[lead.stage],
			LEAD_SOURCE_LABEL[lead.source],
			toNumber(lead.estimatedValue),
			lead.ownerName ?? '',
			day(lead.lastContactAt),
			day(lead.createdAt),
			day(lead.convertedAt),
			lead.lostReason ?? ''
		])
	);

	/* BOM + CRLF: kombinasi yang dibaca benar oleh Excel Windows. */
	const csv = `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
	const stamp = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="prospek-crm-${stamp}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
