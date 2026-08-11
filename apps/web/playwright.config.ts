import { defineConfig } from '@playwright/test';

/**
 * The suite runs against a production build, so it exercises the same SSR path
 * that ships. It needs the API on :3000 and Postgres up — see the README.
 */
export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.e2e.ts',
	// Registration tests mutate shared event capacity, so they must not race.
	workers: 1,
	fullyParallel: false,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'pnpm run build && pnpm run preview --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			// Ticket and feedback links are absolute and built from this, so point
			// it at the preview server rather than the dev server's :5173.
			PUBLIC_SITE_URL: 'http://localhost:4173'
		}
	}
});
