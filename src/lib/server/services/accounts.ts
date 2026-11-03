import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '$db';
import { profiles } from '$db/schema';
import type { UserRole } from '$db/schema';
import { ErpError, fail } from './erpErrors';

/**
 * Pembuatan akun (penulis / freelancer).
 *
 * Kenapa lewat `auth.users` dan bukan `insert into profiles` langsung:
 * `profiles.id` punya foreign key ke `auth.users(id)`, dan trigger
 * `on_auth_user_created` membuat profil awal dengan peran AUTHOR. Menyisipkan
 * profil secara langsung selalu gagal dengan pelanggaran foreign key.
 *
 * Alur:
 *  1. Buat baris `auth.users` (email terkonfirmasi, tanpa kata sandi).
 *  2. Trigger membuat profil AUTHOR.
 *  3. Bila peran yang diminta bukan AUTHOR, perbarui baris profil itu.
 *
 * Akun tanpa kata sandi tidak bisa login sampai undangan/pengaturan sandi
 * dilakukan; untuk alur ERP, yang dibutuhkan hanyalah profil yang bisa
 * dikontrak dan ditugaskan.
 */

export type CreateAccountInput = {
	email: string;
	fullName: string;
	role: Extract<UserRole, 'AUTHOR' | 'FREELANCER'>;
	phone?: string | null;
	specialty?: string | null;
};

export type CreateAccountResult = { id: string; email: string; role: UserRole };

export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
	const email = input.email.trim().toLowerCase();
	const fullName = input.fullName.trim();

	if (fullName.length < 3) fail('INVALID_STATE', 'Nama lengkap minimal 3 karakter.');
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		fail('INVALID_STATE', 'Alamat email tidak valid.');
	}

	const [existing] = await db
		.select({ id: profiles.id, role: profiles.role })
		.from(profiles)
		.where(eq(profiles.email, email))
		.limit(1);

	if (existing) {
		fail(
			'ALREADY_PROCESSED',
			existing.role === input.role
				? `Email ini sudah terdaftar sebagai ${input.role === 'AUTHOR' ? 'penulis' : 'freelancer'}.`
				: `Email ini sudah dipakai akun berperan ${existing.role}.`
		);
	}

	/*
	 * `auth.users` tidak diekspos Drizzle, jadi disisipkan lewat SQL mentah
	 * dengan parameter terikat (bukan interpolasi string). Kolom yang wajib
	 * diisi Supabase minimal: id, instance_id, email, encrypted_password.
	 * Kata sandi kosong = akun belum bisa login.
	 */
	let userId: string;
	try {
		const rows = await db.execute<{ id: string }>(
			sql`
				insert into auth.users (
					instance_id, id, aud, role, email, encrypted_password,
					email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
					created_at, updated_at
				) values (
					'00000000-0000-0000-0000-000000000000',
					gen_random_uuid(),
					'authenticated',
					'authenticated',
					${email},
					'',
					now(),
					'{"provider":"email","providers":["email"]}'::jsonb,
					${JSON.stringify({ full_name: fullName })}::jsonb,
					now(),
					now()
				)
				returning id
			`
		);
		userId = [...rows][0]!.id;
	} catch (e) {
		const code = (e as { code?: string }).code;
		if (code === '23505') {
			fail('ALREADY_PROCESSED', 'Email ini sudah terdaftar di sistem autentikasi.');
		}
		console.error('[accounts] gagal membuat auth user:', e);
		fail('INVALID_STATE', 'Akun gagal dibuat. Periksa konfigurasi autentikasi.');
	}

	/*
	 * Trigger sudah membuat profil AUTHOR. Untuk freelancer (atau bila trigger
	 * tidak aktif di lingkungan ini), pastikan baris profil ada dan benar.
	 */
	await db
		.insert(profiles)
		.values({
			id: userId,
			email,
			fullName,
			role: input.role,
			phone: input.phone?.trim() || null,
			specialty: (input.specialty as never) ?? null,
			isActive: true
		})
		.onConflictDoUpdate({
			target: profiles.id,
			set: {
				fullName,
				role: input.role,
				phone: input.phone?.trim() || null,
				specialty: (input.specialty as never) ?? null,
				isActive: true,
				updatedAt: new Date()
			}
		});

	return { id: userId, email, role: input.role };
}

/** Menonaktifkan atau mengaktifkan akun. */
export async function setAccountActive(userId: string, isActive: boolean): Promise<void> {
	await db.update(profiles).set({ isActive, updatedAt: new Date() }).where(eq(profiles.id, userId));
}

export { ErpError };
