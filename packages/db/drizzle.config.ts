import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env', quiet: true });

const { DB_CLUSTER_ARN, DB_SECRET_ARN, DB_NAME, DATABASE_URL } = process.env;

const shared = {
	dialect: 'postgresql',
	schema: './src/schema.ts',
	out: './drizzle',
	casing: 'snake_case',
	strict: true,
	verbose: true
} as const;

/**
 * `drizzle-kit generate` diffs the schema against the migration journal and
 * needs no database at all, so migrations can be authored offline. Only
 * `migrate`, `push` and `studio` connect — and those pick the driver from the
 * environment, exactly as the runtime client does.
 */
export default defineConfig(
	DB_CLUSTER_ARN && DB_SECRET_ARN
		? {
				...shared,
				driver: 'aws-data-api',
				dbCredentials: {
					database: DB_NAME ?? 'awsug_lao',
					resourceArn: DB_CLUSTER_ARN,
					secretArn: DB_SECRET_ARN
				}
			}
		: {
				...shared,
				dbCredentials: {
					url: DATABASE_URL ?? 'postgresql://awsug:awsug_local_dev@localhost:5433/awsug_lao'
				}
			}
);
