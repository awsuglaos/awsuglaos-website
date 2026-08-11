import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globalSetup: ['./test/global-setup.ts'],
		setupFiles: ['./test/setup.ts'],
		// Test files share one database, so they must not run concurrently with
		// each other. Concurrency *within* a test (the capacity race) is the point
		// and is unaffected by this.
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 30_000
	}
});
