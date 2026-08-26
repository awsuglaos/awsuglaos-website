import './env.js';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbConfig } from '../client.js';
import * as schema from '../schema.js';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

const config = resolveDbConfig();

/**
 * Walks the cause chain looking for a specific AWS error name. The Data API
 * error arrives wrapped in Drizzle's own query error, so the name we want is
 * never on the top-level object.
 */
function hasErrorName(error: unknown, name: string): boolean {
	for (let e: unknown = error, depth = 0; e && depth < 8; depth++) {
		if (typeof e === 'object' && (e as { name?: string }).name === name) return true;
		e = (e as { cause?: unknown }).cause;
	}
	return false;
}

/**
 * Aurora is configured to scale to zero, so the first Data API call after an
 * idle period returns DatabaseResumingException instead of waiting. The AWS SDK
 * does not mark it retryable — `$retryable` is undefined — so nothing retries
 * it on our behalf and the migration dies against a database that is merely
 * waking up. Every deploy that follows a quiet spell hits this.
 *
 * Resumes take roughly 15-30 seconds; the ceiling here is deliberately well
 * past that so a slow wake does not fail a release.
 */
async function withResumeRetry<T>(run: () => Promise<T>, attempts = 12): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			if (attempt >= attempts || !hasErrorName(error, 'DatabaseResumingException')) throw error;
			console.log(`Aurora is resuming; retrying in 10s (attempt ${attempt}/${attempts})…`);
			await new Promise((resolve) => setTimeout(resolve, 10_000));
		}
	}
}

if (config.kind === 'data-api') {
	const [{ drizzle }, { migrate }, { RDSDataClient }] = await Promise.all([
		import('drizzle-orm/aws-data-api/pg'),
		import('drizzle-orm/aws-data-api/pg/migrator'),
		import('@aws-sdk/client-rds-data')
	]);

	console.log(`Migrating Aurora via the Data API (${config.database})…`);
	const db = drizzle(new RDSDataClient({}), {
		database: config.database,
		secretArn: config.secretArn,
		resourceArn: config.resourceArn,
		schema
	});
	await withResumeRetry(() => migrate(db, { migrationsFolder }));
} else {
	const [{ drizzle }, { migrate }, pg] = await Promise.all([
		import('drizzle-orm/node-postgres'),
		import('drizzle-orm/node-postgres/migrator'),
		import('pg')
	]);

	console.log('Migrating local Postgres…');
	const pool = new pg.default.Pool({ connectionString: config.connectionString, max: 1 });
	const db = drizzle(pool, { schema });
	await migrate(db, { migrationsFolder });
	await pool.end();
}

console.log('Migrations applied.');
