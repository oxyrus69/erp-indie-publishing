import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$db';
import { appSettings } from '$db/schema';
import {
	getDocumentSettings,
	getPrintSettings,
	getWithdrawalSettings,
	invalidateSettings,
	parseDocumentSettings,
	parsePrintSettings,
	parseWithdrawalSettings,
	type FieldError
} from '$lib/server/services/settings';
import { computePrintCost } from '$lib/server/services/printing';
import { getDecisionSettings, saveDecisionRules } from '$lib/server/services/dss';
import { audit } from '$lib/server/services/auditDraft';
import { toMoneyString } from '$lib/server/services/money';
import type { Actions, PageServerLoad } from './$types';

/**
 * Peran yang boleh mengubah pengaturan.
 *
 * PM ikut diizinkan karena tarif HPP adalah dasar penawaran yang mereka buat
 * saat menjual paket; finance tetap yang mengawal PPN dan penomoran. Membatasi
 * hanya finance membuat PM harus menitipkan perubahan harga lewat orang lain
 * di tengah negosiasi.
 */
const SETTINGS_ROLES = ['SUPER_ADMIN', 'FINANCE', 'PROJECT_MANAGER'] as const;

/**
 * Pengaturan operasional.
 *
 * Tarif HPP, PPN, prefix dokumen, dan minimum penarikan sebelumnya berupa
 * konstanta di kode (`printing.ts`, `erpEngine.ts`). Akibatnya setiap
 * perubahan harga vendor berarti deploy ulang — dan bila deploy tidak
 * mungkin, angkanya tetap salah sampai ada yang sempat memperbaikinya.
 *
 * Halaman ini memindahkan keputusan itu ke database: tim keuangan mengubah
 * angka, pratinjau HPP memperlihatkan akibatnya, dan setiap simpan tercatat
 * di jejak aktivitas.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const role = locals.profile?.role;
	if (!role || !SETTINGS_ROLES.includes(role as (typeof SETTINGS_ROLES)[number])) {
		error(403, 'Pengaturan tarif hanya untuk tim keuangan.');
	}

	const [print, document, withdrawal, meta, decision] = await Promise.all([
		getPrintSettings(),
		getDocumentSettings(),
		getWithdrawalSettings(),
		db.select({ key: appSettings.key, updatedAt: appSettings.updatedAt }).from(appSettings),
		getDecisionSettings()
	]);

	const updatedAt = Object.fromEntries(meta.map((row) => [row.key, row.updatedAt]));

	/*
	 * Pratinjau memakai contoh nyata supaya tarif tidak abstrak: staf melihat
	 * rupiah per eksemplar, bukan hanya "180 per halaman".
	 */
	const preview = computePrintCost(SAMPLE_PRINT, print);

	return { print, document, withdrawal, decision, updatedAt, preview };
};

/** Contoh tetap untuk pratinjau: satu judul 176 halaman, cetak 300 eksemplar. */
const SAMPLE_PRINT = {
	pageCount: 176,
	paperType: 'BOOKPAPER' as const,
	bookSize: 'A5' as const,
	binding: 'PERFECT_BINDING' as const,
	lamination: 'DOFF' as const,
	isFullColor: false,
	quantity: 300
};

/** Menyimpan satu domain pengaturan; domain lain tidak tersentuh. */
async function saveDomain(
	key: 'print' | 'document' | 'withdrawal',
	value: Record<string, unknown>,
	actorId: string
): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key, value, updatedBy: actorId, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value, updatedBy: actorId, updatedAt: new Date() }
		});
	invalidateSettings(key);
}

function guard(role: string | undefined): boolean {
	return Boolean(role && SETTINGS_ROLES.includes(role as (typeof SETTINGS_ROLES)[number]));
}

function fieldFailure(errors: FieldError[]) {
	return fail(400, {
		message: errors.map((e) => e.message).join(' '),
		fieldErrors: errors
	});
}

export const actions: Actions = {
	/** Tarif cetak + PPN. */
	savePrint: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !guard(profile.role)) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat mengubah tarif.' });
		}

		const form = await request.formData();
		const { value, errors } = parsePrintSettings(form);
		if (errors.length > 0) return fieldFailure(errors);

		await saveDomain('print', value as unknown as Record<string, unknown>, profile.id);

		const preview = computePrintCost(SAMPLE_PRINT, value);

		await audit({
			actor: profile,
			action: 'settings.updated',
			entityType: 'settings',
			entityId: null,
			summary: `Memperbarui tarif cetak. Contoh 176 hlm A5 bookpaper: ${preview.costPerUnit}/eksemplar, PPN ${value.vatPct}%.`,
			changes: {
				fullColorMultiplier: { from: null, to: value.fullColorMultiplier },
				minPages: { from: null, to: value.minPages },
				vatPct: { from: null, to: value.vatPct }
			},
			context: { domain: 'print' }
		});

		return {
			ok: true,
			domain: 'print',
			message: 'Tarif cetak disimpan. Order cetak berikutnya memakai angka ini.'
		};
	},

	/** Prefix penomoran dokumen. */
	saveDocument: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !guard(profile.role)) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat mengubah penomoran.' });
		}

		const form = await request.formData();
		const { value, errors } = parseDocumentSettings(form);
		if (errors.length > 0) return fieldFailure(errors);

		await saveDomain('document', value as unknown as Record<string, unknown>, profile.id);

		await audit({
			actor: profile,
			action: 'settings.updated',
			entityType: 'settings',
			entityId: null,
			summary: `Memperbarui prefix dokumen: invoice ${value.invoicePrefix}, order ${value.orderPrefix}.`,
			context: { domain: 'document', ...value }
		});

		return {
			ok: true,
			domain: 'document',
			message: 'Prefix penomoran disimpan. Dokumen berikutnya memakai prefix baru.'
		};
	},

	/** Minimum penarikan. */
	saveWithdrawal: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !guard(profile.role)) {
			return fail(403, { message: 'Hanya tim keuangan yang dapat mengubah batas penarikan.' });
		}

		const form = await request.formData();
		const { value, errors } = parseWithdrawalSettings(form);
		if (errors.length > 0) return fieldFailure(errors);

		await saveDomain('withdrawal', value as unknown as Record<string, unknown>, profile.id);

		await audit({
			actor: profile,
			action: 'settings.updated',
			entityType: 'settings',
			entityId: null,
			summary: `Minimum penarikan menjadi ${toMoneyString(value.minimumAmount)}.`,
			context: { domain: 'withdrawal', minimumAmount: value.minimumAmount }
		});

		return {
			ok: true,
			domain: 'withdrawal',
			message: `Minimum penarikan disimpan: ${new Intl.NumberFormat('id-ID').format(value.minimumAmount)} rupiah.`
		};
	},

	/**
	 * Ambang keputusan DSS.
	 *
	 * Yang bisa diubah hanya angkanya; strukturnya tetap di kode. Ini disengaja:
	 * aturan yang bisa disusun bebas dari UI akan menghasilkan dua aturan yang
	 * saling bertentangan tanpa ada yang menyadarinya.
	 */
	saveDecision: async ({ request, locals }) => {
		const profile = locals.profile;
		if (!profile || !guard(profile.role)) {
			return fail(403, { message: 'Hanya tim internal yang dapat mengubah ambang keputusan.' });
		}

		const form = await request.formData();
		const pick = (name: string, label: string, min: number, max: number) => {
			const raw = String(form.get(name) ?? '').replace(/\./g, '').replace(',', '.');
			const value = Number.parseFloat(raw);
			if (!Number.isFinite(value) || value < min || value > max) {
				return { error: `${label} harus antara ${min} dan ${max}.`, value: 0 };
			}
			return { value };
		};

		const fields = [
			['minMarginPct', 'Margin minimum', 0, 95],
			['reorderCoverDays', 'Hari tutup stok', 1, 365],
			['slowMoverPerMonth', 'Batas lambat laku', 0, 10000],
			['deadStockValue', 'Nilai modal tertahan', 0, 1_000_000_000],
			['overdueWarnDays', 'Toleransi lewat tenggat', 0, 365],
			['concentrationPct', 'Ambang konsentrasi', 1, 100],
			['holdProductionThreshold', 'Ambang tahan produksi', 0, 100_000_000_000],
			['maxOpenTasks', 'Batas task terbuka', 1, 100],
			['staleTaskDays', 'Hari task macet', 1, 365],
			['deadlineWarnDays', 'Peringatan tenggat', 0, 180]
		] as const;

		const errors: string[] = [];
		const values: Record<string, number> = {};
		for (const [name, label, min, max] of fields) {
			const result = pick(name, label, min, max);
			if ('error' in result && result.error) errors.push(result.error);
			values[name] = result.value;
		}
		if (errors.length > 0) return fail(400, { message: errors.join(' ') });

		try {
			await Promise.all([
				saveDecisionRules(
					'title',
					{
						minMarginPct: values.minMarginPct,
						reorderCoverDays: values.reorderCoverDays,
						slowMoverPerMonth: values.slowMoverPerMonth,
						deadStockValue: values.deadStockValue
					},
					profile.id
				),
				saveDecisionRules(
					'cash',
					{
						overdueWarnDays: values.overdueWarnDays,
						concentrationPct: values.concentrationPct,
						holdProductionThreshold: values.holdProductionThreshold
					},
					profile.id
				),
				saveDecisionRules(
					'production',
					{
						maxOpenTasks: values.maxOpenTasks,
						staleTaskDays: values.staleTaskDays,
						deadlineWarnDays: values.deadlineWarnDays
					},
					profile.id
				)
			]);

			await audit({
				actor: profile,
				action: 'rules.updated',
				entityType: 'settings',
				entityId: null,
				summary: `Mengubah ambang keputusan: margin minimum ${values.minMarginPct}%, toleransi piutang ${values.overdueWarnDays} hari.`,
				context: values,
				changes: {
					minMarginPct: { from: null, to: values.minMarginPct },
					overdueWarnDays: { from: null, to: values.overdueWarnDays }
				}
			});

			return { ok: true, domain: 'decision', message: 'Ambang keputusan disimpan.' };
		} catch (e) {
			console.error('[pengaturan] gagal menyimpan ambang:', e);
			return fail(500, { message: 'Ambang gagal disimpan. Coba lagi.' });
		}
	}
};
