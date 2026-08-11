import './env.js';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbConfig } from '../client.js';
import * as schema from '../schema.js';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

const config = resolveDbConfig();

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
	await migrate(db, { migrationsFolder });
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
