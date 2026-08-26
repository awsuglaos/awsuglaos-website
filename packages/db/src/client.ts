import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

/**
 * The common supertype of both drivers. Drizzle's query-builder surface is
 * identical across them, so `core` is written once against this type and never
 * needs to know where it is running.
 */
export type Database = PgDatabase<
	PgQueryResultHKT,
	typeof schema,
	ExtractTablesWithRelations<typeof schema>
>;

export type DbConfig =
	| { kind: 'postgres'; connectionString: string }
	/**
	 * Aurora Serverless v2 over the RDS Data API. This is what keeps every Lambda
	 * outside the VPC: no NAT Gateway, no ENI cold start, and Aurora stays free to
	 * scale to zero (RDS Proxy would have blocked auto-pause).
	 */
	| { kind: 'data-api'; resourceArn: string; secretArn: string; database: string };

/**
 * `sst shell` publishes each linked resource as SST_RESOURCE_<Name>, holding a
 * JSON blob of that component's properties — it does *not* replay the
 * `environment` block of any particular function. So `sst shell -- pnpm
 * db:migrate`, which is how migrations run in CI, arrives with this set and
 * DB_CLUSTER_ARN unset.
 */
function fromSstLink(raw: string | undefined): DbConfig | null {
	if (!raw) return null;

	try {
		const link = JSON.parse(raw) as {
			clusterArn?: string;
			secretArn?: string;
			database?: string;
		};
		if (!link.clusterArn || !link.secretArn) return null;

		return {
			kind: 'data-api',
			resourceArn: link.clusterArn,
			secretArn: link.secretArn,
			database: link.database ?? 'awsug_lao'
		};
	} catch {
		// Malformed rather than absent: fall through to the other sources rather
		// than taking the whole process down over a link we may not need.
		return null;
	}
}

/** Reads the environment to decide which driver to use. */
export function resolveDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
	const { DB_CLUSTER_ARN, DB_SECRET_ARN, DB_NAME, DATABASE_URL } = env;

	// Explicit wins: this is what the deployed Lambdas set for themselves.
	if (DB_CLUSTER_ARN && DB_SECRET_ARN) {
		return {
			kind: 'data-api',
			resourceArn: DB_CLUSTER_ARN,
			secretArn: DB_SECRET_ARN,
			database: DB_NAME ?? 'awsug_lao'
		};
	}

	/*
	 * Checked before DATABASE_URL on purpose. A CI runner can legitimately carry
	 * a localhost DATABASE_URL for the test job while also being inside an
	 * `sst shell` aimed at Aurora; preferring the link means the migration talks
	 * to the cluster instead of quietly trying to reach a database that is not
	 * there, which surfaces as ECONNREFUSED on 127.0.0.1:5432.
	 */
	const linked = fromSstLink(env.SST_RESOURCE_Database);
	if (linked) return linked;

	if (DATABASE_URL) {
		return { kind: 'postgres', connectionString: DATABASE_URL };
	}

	throw new Error(
		'No database configuration found. Set DATABASE_URL for local Postgres, or ' +
			'DB_CLUSTER_ARN + DB_SECRET_ARN for Aurora via the Data API.'
	);
}

/**
 * True when this error, or anything in its cause chain, is Aurora telling us it
 * is waking from auto-pause.
 *
 * The name is never on the top-level object: the SDK error arrives wrapped by
 * Drizzle's own query error, sometimes more than one layer deep.
 */
export function isDatabaseResuming(error: unknown): boolean {
	for (let e: unknown = error, depth = 0; e && depth < 8; depth++) {
		if (typeof e === 'object' && (e as { name?: string }).name === 'DatabaseResumingException') {
			return true;
		}
		e = (e as { cause?: unknown }).cause;
	}
	return false;
}

/*
 * Aurora scales to zero, so the first Data API call after an idle period fails
 * immediately with DatabaseResumingException rather than blocking until the
 * cluster is up. The SDK leaves `$retryable` undefined, so its own retry
 * strategy ignores it — which means an ordinary visitor arriving after a quiet
 * hour got a 500 instead of a slow page.
 *
 * The budget is deliberate. The server Lambda's timeout is 30 seconds (set in
 * sst.config.ts) and CloudFront gives an origin 30 seconds before it returns a
 * 504, so the wait has to finish inside that. Eight attempts at 2.5s covers the
 * ~15-25s a resume normally takes, and still leaves room for the render.
 */
const RESUME_ATTEMPTS = 8;
const RESUME_DELAY_MS = 2_500;

/**
 * Retries the whole call rather than marking the error retryable and delegating
 * to the SDK, so the behaviour does not depend on where the retry middleware
 * happens to sit in the stack.
 */
function withResumeRetry(client: { middlewareStack: { add: (m: never, o: never) => void } }): void {
	const middleware =
		(next: (args: unknown) => Promise<unknown>) =>
		async (args: unknown): Promise<unknown> => {
			for (let attempt = 1; ; attempt++) {
				try {
					return await next(args);
				} catch (error) {
					if (attempt >= RESUME_ATTEMPTS || !isDatabaseResuming(error)) throw error;
					await new Promise((resolve) => setTimeout(resolve, RESUME_DELAY_MS));
				}
			}
		};

	client.middlewareStack.add(
		middleware as never,
		{
			// Outermost step, so a retry replays serialisation too.
			step: 'initialize',
			name: 'auroraResumeRetry'
		} as never
	);
}

/**
 * Drivers are imported dynamically so each deployment target only bundles the
 * one it uses — `pg` never reaches the Lambda bundle, the AWS SDK never reaches
 * local dev.
 */
export async function createDatabase(config: DbConfig = resolveDbConfig()): Promise<Database> {
	if (config.kind === 'data-api') {
		const [{ drizzle }, { RDSDataClient }] = await Promise.all([
			import('drizzle-orm/aws-data-api/pg'),
			import('@aws-sdk/client-rds-data')
		]);

		const client = new RDSDataClient({});
		withResumeRetry(client);

		return drizzle(client, {
			database: config.database,
			secretArn: config.secretArn,
			resourceArn: config.resourceArn,
			schema
		}) as unknown as Database;
	}

	const [{ drizzle }, pg] = await Promise.all([import('drizzle-orm/node-postgres'), import('pg')]);

	const pool = new pg.default.Pool({
		connectionString: config.connectionString,
		// Lambda would never use this driver, so a small local pool is plenty.
		max: 10
	});

	return drizzle(pool, { schema }) as unknown as Database;
}

let cached: Promise<Database> | undefined;

/**
 * Module-level singleton. On Lambda this survives between invocations on a warm
 * container, so the RDS Data API client and its credential chain are reused.
 */
export function getDb(): Promise<Database> {
	cached ??= createDatabase();
	return cached;
}

/** Test helper — drops the cached instance so the next call reconnects. */
export function resetDbCache(): void {
	cached = undefined;
}
