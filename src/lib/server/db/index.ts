import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

/**
 * Supabase Postgres requires SSL. `prepare: false` keeps us compatible with
 * transaction-mode pooling (Supavisor / pgBouncer) so that prepared statements
 * are not pinned to a single backend connection.
 */
const globalForDb = globalThis as unknown as {
	__pgClient?: ReturnType<typeof postgres>;
};

function createClient() {
	const connectionString = env.DATABASE_URL;
	if (!connectionString) {
		throw new Error('[db] DATABASE_URL belum diset.');
	}
	return postgres(connectionString, {
		max: 10,
		prepare: false,
		ssl: 'require',
		idle_timeout: 20,
		connect_timeout: 10
	});
}

export const pgClient = globalForDb.__pgClient ?? createClient();
if (env.NODE_ENV !== 'production') globalForDb.__pgClient = pgClient;

export const db = drizzle(pgClient, { schema, casing: 'snake_case' });

/** Tipe transaksi Drizzle — dipakai oleh fungsi-fungsi service agar bisa di-compose. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTransaction;

export { schema };
