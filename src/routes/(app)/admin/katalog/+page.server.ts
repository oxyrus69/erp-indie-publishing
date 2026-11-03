import { error, fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$db';
import { packages, services } from '$db/schema';
import { toNumber, toMoneyString } from '$lib/server/services/money';
import { audit } from '$lib/server/services/auditDraft';
import { ErpError } from '$lib/server/services/erpErrors';
import type { Actions, PageServerLoad } from './$types';

const PM_ROLES = ['SUPER_ADMIN', 'PROJECT_MANAGER'] as const;

function toFailure(e: unknown) {
	if (e instanceof ErpError) return fail(e.httpStatus, { message: e.message });
	return fail(500, { message: 'Terjadi kesalahan tak terduga. Coba lagi atau hubungi admin.' });
}

/**
 * Pelanggaran UNIQUE.
 *
 * Drizzle membungkus error driver dalam `DrizzleQueryError`, sehingga kode
 * Postgres ada di `cause.code` — bukan di `e.code`. Memeriksa satu level saja
 * membuat bentrok kode tampil sebagai "kesalahan tak terduga" padahal
 * penyebabnya bisa dijelaskan ke pengguna.
 */
function isUniqueViolation(e: unknown): boolean {
	const codes: unknown[] = [];
	if (e && typeof e === 'object') {
		codes.push((e as { code?: unknown }).code);
		const cause = (e as { cause?: unknown }).cause;
		if (cause && typeof cause === 'object') codes.push((cause as { code?: unknown }).code);
	}
	return codes.includes('23505');
}

/**
 * Katalog: paket dan layanan a-la-carte.
 *
 * Katalog adalah sumber harga untuk pembuatan order. Karena itu ia harus bisa
 * diubah tanpa deploy — perubahan harga paket tidak boleh menunggu rilis.
 *
 * Menonaktifkan (`isActive = false`) dipilih daripada menghapus: paket yang
 * sudah dipakai order lama harus tetap ada agar riwayat kontrak terbaca.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !PM_ROLES.includes(role as (typeof PM_ROLES)[number])) {
		error(403, 'Katalog hanya untuk Project Manager.');
	}

	const [packageRows, serviceRows] = await Promise.all([
		db.select().from(packages).orderBy(asc(packages.sortOrder), asc(packages.name)),
		db.select().from(services).orderBy(asc(services.name))
	]);

	return {
		packages: packageRows.map((row) => ({
			...row,
			basePriceNum: toNumber(row.basePrice),
			downPaymentPctNum: toNumber(row.downPaymentPct),
			authorRoyaltyPctNum: toNumber(row.authorRoyaltyPct)
		})),
		services: serviceRows.map((row) => ({ ...row, unitPriceNum: toNumber(row.unitPrice) }))
	};
};

function requirePm(role: string | undefined): boolean {
	return Boolean(role && PM_ROLES.includes(role as (typeof PM_ROLES)[number]));
}

/** Kode katalog: huruf kapital, angka, strip. Dipakai sebagai kunci bisnis. */
function normalizeCode(raw: string): string {
	return raw
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export const actions: Actions = {
	/** Menyimpan paket: buat baru bila `id` kosong, perbarui bila ada. */
	savePackage: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !requirePm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah katalog.' });
		}

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const code = normalizeCode(String(form.get('code') ?? ''));
		const name = String(form.get('name') ?? '').trim();
		const tagline = String(form.get('tagline') ?? '').trim() || null;
		const basePrice = Number(String(form.get('basePrice') ?? '').replace(/[^\d]/g, ''));
		const freeAuthorCopies = Number(form.get('freeAuthorCopies') ?? 0);
		const maxCoverRevisions = Number(form.get('maxCoverRevisions') ?? 2);
		const maxLayoutRevisions = Number(form.get('maxLayoutRevisions') ?? 2);
		const authorRoyaltyPct = Number(form.get('authorRoyaltyPct') ?? 10);
		const downPaymentPct = Number(form.get('downPaymentPct') ?? 50);
		const includesIsbn = form.get('includesIsbn') === 'on';
		const includesLayout = form.get('includesLayout') === 'on';
		const includesCover = form.get('includesCover') === 'on';
		const includesEditing = form.get('includesEditing') === 'on';
		const isActive = form.get('isActive') === 'on';

		if (code.length < 3) return fail(400, { message: 'Kode paket minimal 3 karakter.' });
		if (name.length < 3) return fail(400, { message: 'Nama paket minimal 3 karakter.' });
		if (!Number.isFinite(basePrice) || basePrice <= 0) {
			return fail(400, { message: 'Harga paket harus lebih dari 0.' });
		}
		if (!Number.isFinite(downPaymentPct) || downPaymentPct < 0 || downPaymentPct > 100) {
			return fail(400, { message: 'DP harus antara 0 dan 100 persen.' });
		}
		if (!Number.isFinite(authorRoyaltyPct) || authorRoyaltyPct < 0 || authorRoyaltyPct > 100) {
			return fail(400, { message: 'Royalti harus antara 0 dan 100 persen.' });
		}

		try {
			const values = {
				code,
				name,
				tagline,
				basePrice: toMoneyString(basePrice),
				freeAuthorCopies: Math.max(0, Math.floor(freeAuthorCopies)),
				maxCoverRevisions: Math.max(0, Math.floor(maxCoverRevisions)),
				maxLayoutRevisions: Math.max(0, Math.floor(maxLayoutRevisions)),
				/* Kolom numeric(5,2) menerima string; konversi ini menjaga presisi. */
				authorRoyaltyPct: toMoneyString(authorRoyaltyPct),
				downPaymentPct: toMoneyString(downPaymentPct),
				includesIsbn,
				includesLayout,
				includesCover,
				includesEditing,
				isActive
			};

			let savedId = id;
			if (id) {
				await db.update(packages).set(values).where(eq(packages.id, id));
			} else {
				const [row] = await db.insert(packages).values(values).returning({ id: packages.id });
				savedId = row!.id;
			}

			await audit({
				actor: profile,
				action: 'catalog.package_saved',
				entityType: 'catalog',
				entityId: savedId,
				summary: `${id ? 'Memperbarui' : 'Menambah'} paket ${name} (${code}) — ${toMoneyString(basePrice)}, DP ${downPaymentPct}%.`,
				context: { code, basePrice, downPaymentPct, authorRoyaltyPct, isActive }
			});

			return {
				ok: true,
				message: id ? `Paket ${name} diperbarui.` : `Paket ${name} ditambahkan ke katalog.`
			};
		} catch (e) {
			/* Kode unik: bentrok adalah kesalahan pengguna, bukan server. */
			if (isUniqueViolation(e)) {
				return fail(409, { message: `Kode "${code}" sudah dipakai paket lain.` });
			}
			return toFailure(e);
		}
	},

	/** Menyimpan layanan a-la-carte. */
	saveService: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !requirePm(profile.role)) {
			return fail(403, { message: 'Hanya Project Manager yang dapat mengubah katalog.' });
		}

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const code = normalizeCode(String(form.get('code') ?? ''));
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const unitPrice = Number(String(form.get('unitPrice') ?? '').replace(/[^\d]/g, ''));
		const unit = String(form.get('unit') ?? 'paket').trim() || 'paket';
		const isActive = form.get('isActive') === 'on';

		if (code.length < 3) return fail(400, { message: 'Kode layanan minimal 3 karakter.' });
		if (name.length < 3) return fail(400, { message: 'Nama layanan minimal 3 karakter.' });
		if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
			return fail(400, { message: 'Harga layanan harus lebih dari 0.' });
		}

		try {
			const values = {
				code,
				name,
				description,
				unitPrice: toMoneyString(unitPrice),
				unit,
				isActive
			};

			let savedId = id;
			if (id) {
				await db.update(services).set(values).where(eq(services.id, id));
			} else {
				const [row] = await db.insert(services).values(values).returning({ id: services.id });
				savedId = row!.id;
			}

			await audit({
				actor: profile,
				action: 'catalog.service_saved',
				entityType: 'catalog',
				entityId: savedId,
				summary: `${id ? 'Memperbarui' : 'Menambah'} layanan ${name} (${code}) — ${toMoneyString(unitPrice)} / ${unit}.`,
				context: { code, unitPrice, unit, isActive }
			});

			return {
				ok: true,
				message: id ? `Layanan ${name} diperbarui.` : `Layanan ${name} ditambahkan.`
			};
		} catch (e) {
			if (isUniqueViolation(e)) {
				return fail(409, { message: `Kode "${code}" sudah dipakai layanan lain.` });
			}
			return toFailure(e);
		}
	}
};
