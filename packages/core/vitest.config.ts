import { defineConfig } from 'vitest/config';

/*
 * Two projects, because two kinds of test live here.
 *
 * Most of the suite drives real Drizzle queries and needs Postgres, so it pays
 * for a migrated database and gives up file parallelism. The email templates
 * and dispatchers are pure functions over strings and injected clients: making
 * them wait on a container would mean nobody could check the mail rendering
 * without Docker running, which is exactly when you most want to.
 */
const UNIT_TESTS = ['test/email.test.ts', 'test/render.test.ts'];

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: UNIT_TESTS,
					testTimeout: 10_000
				}
			},
			{
				test: {
					name: 'db',
					include: ['test/**/*.test.ts'],
					// Without this the unit files would run a second time here,
					// paying for the database they do not use.
					exclude: UNIT_TESTS,
					globalSetup: ['./test/global-setup.ts'],
					setupFiles: ['./test/setup.ts'],
					// Test files share one database, so they must not run concurrently
					// with each other. Concurrency *within* a test (the capacity race)
					// is the point and is unaffected by this.
					fileParallelism: false,
					testTimeout: 30_000,
					hookTimeout: 30_000
				}
			}
		]
	}
});
