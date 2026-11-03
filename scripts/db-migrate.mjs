/**
 * Menjalankan migrasi Drizzle lalu migrasi SQL tambahan (integrasi auth.users,
 * tabel bantu seperti idempotency_keys).
 *
 *   node scripts/db-migrate.mjs
 *
 * Idempoten: migrasi yang sudah diterapkan akan dilewati.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL belum diset di .env');
	process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false, ssl: 'require' });
const db = drizzle(client);

async function main() {
	console.log('> Menjalankan migrasi Drizzle...');
	await migrate(db, { migrationsFolder: './drizzle' });
	console.log('OK Migrasi Drizzle selesai.');

	/* Migrasi tambahan yang tidak dikelola drizzle-kit (skema auth, tabel bantu). */
	await client`
		create table if not exists public.extra_migrations (
			name text primary key,
			applied_at timestamptz not null default now()
		)`;

	const dir = './drizzle';

	/*
	 * File yang tercatat di journal drizzle-kit sudah dijalankan oleh `migrate`.
	 * Semua file .sql lain di folder ini adalah migrasi tambahan buatan tangan:
	 * diterapkan di sini dan dicatat di `extra_migrations` agar tidak diulang.
	 */
	const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8'));
	const managedByDrizzle = new Set((journal.entries ?? []).map((entry) => entry.tag));

	const extras = readdirSync(dir)
		.filter((file) => /^\d{4}_.+\.sql$/.test(file))
		.sort();

	for (const file of extras) {
		const tag = file.replace(/\.sql$/, '');
		if (managedByDrizzle.has(tag)) continue;

		const [row] = await client`select 1 from public.extra_migrations where name = ${file}`;
		if (row) {
			console.log(`- Lewati ${file} (sudah diterapkan).`);
			continue;
		}

		console.log(`> Menerapkan ${file}...`);
		await client.unsafe(readFileSync(join(dir, file), 'utf8'));
		await client`insert into public.extra_migrations (name) values (${file})`;
		console.log(`OK ${file} diterapkan.`);
	}

	await client.end({ timeout: 5 });
	console.log('OK Semua migrasi selesai.');
}

main().catch(async (err) => {
	console.error('Gagal migrasi:', err.message);
	await client.end({ timeout: 5 }).catch(() => {});
	process.exit(1);
});
