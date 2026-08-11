import './env.js';

import { sql } from 'drizzle-orm';
import { createDatabase, resolveDbConfig } from '../client.js';

/**
 * Drops and recreates the public schema. Local development only — it refuses to
 * run against Aurora so a stray `pnpm db:reset` can never wipe a deployed stage.
 */
const config = resolveDbConfig();

if (config.kind !== 'postgres') {
	console.error('Refusing to reset a non-local database. Unset DB_CLUSTER_ARN to reset locally.');
	process.exit(1);
}

const db = await createDatabase(config);
await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
await db.execute(sql`DROP SCHEMA public CASCADE`);
await db.execute(sql`CREATE SCHEMA public`);

console.log('Local database reset. Run `pnpm db:migrate` next.');
process.exit(0);
