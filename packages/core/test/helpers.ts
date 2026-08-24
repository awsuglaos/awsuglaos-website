import { createDatabase, type Database } from '@awsug/db';
import { sql } from 'drizzle-orm';
import { MemoryEmailDispatcher } from '../src/email/console.js';
import type { AppContext } from '../src/context.js';

let db: Database | undefined;

export async function getTestDb(): Promise<Database> {
	db ??= await createDatabase({
		kind: 'postgres',
		connectionString: process.env.TEST_DATABASE_URL ?? testUrlFallback()
	});
	return db;
}

function testUrlFallback(): string {
	const base =
		process.env.DATABASE_URL ?? 'postgresql://awsug:awsug_local_dev@localhost:5433/awsug_lao';
	const url = new URL(base);
	url.pathname = '/awsug_lao_test';
	return url.toString();
}

/**
 * CASCADE handles the join tables, but every table is still named explicitly:
 * a new table left off this list silently leaks rows between tests, which
 * surfaces later as a confusing unique-constraint failure rather than as an
 * obvious isolation bug.
 */
export async function truncateAll(): Promise<void> {
	const database = await getTestDb();
	await database.execute(
		sql`TRUNCATE TABLE
			event_feedback,
			event_speaker_translations,
			event_speakers,
			event_sponsors,
			speaker_translations,
			speakers,
			registrations,
			event_translations,
			events,
			article_translations,
			articles,
			sponsors,
			newsletter_subs,
			users
		RESTART IDENTITY CASCADE`
	);
}

export async function makeContext(
	overrides: Partial<AppContext> = {}
): Promise<AppContext & { email: MemoryEmailDispatcher }> {
	const email = new MemoryEmailDispatcher();
	return {
		db: await getTestDb(),
		email,
		siteUrl: 'https://awsug.la',
		...overrides,
		email: (overrides.email as MemoryEmailDispatcher) ?? email
	};
}

/** Convenience: a published event starting in the future. */
export function futureEvent(overrides: Record<string, unknown> = {}) {
	const start = new Date(Date.now() + 7 * 86_400_000);
	return {
		slug: 'test-event',
		startAt: start,
		endAt: new Date(start.getTime() + 3 * 3_600_000),
		capacity: 10,
		status: 'published' as const,
		locationUrl: '',
		coverImageUrl: '',
		translations: [
			{
				locale: 'lo' as const,
				title: 'ງານທົດສອບ',
				description: 'ລາຍລະອຽດງານທົດສອບ',
				locationName: 'ວຽງຈັນ'
			},
			{
				locale: 'en' as const,
				title: 'Test Event',
				description: 'Test event description',
				locationName: 'Vientiane'
			}
		],
		...overrides
	};
}
