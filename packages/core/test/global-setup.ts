import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const here = dirname(fileURLToPath(import.meta.url));
const TEST_DB = 'awsug_lao_test';

function adminUrl(): string {
	const base = process.env.DATABASE_URL ?? 'postgresql://awsug:awsug_local_dev@localhost:5433/awsug_lao';
	return base;
}

export function testDatabaseUrl(): string {
	const url = new URL(adminUrl());
	url.pathname = `/${TEST_DB}`;
	return url.toString();
}

/**
 * Tests run against a dedicated database rather than the dev one, so a test run
 * can never truncate seeded development data.
 */
export async function setup() {
	const admin = new pg.Client({ connectionString: adminUrl() });
	await admin.connect();
	const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
	if (rowCount === 0) {
		await admin.query(`CREATE DATABASE ${TEST_DB}`);
	}
	await admin.end();

	const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });
	const db = drizzle(pool);
	await migrate(db, { migrationsFolder: resolve(here, '../../db/drizzle') });
	await pool.end();

	process.env.TEST_DATABASE_URL = testDatabaseUrl();
}
