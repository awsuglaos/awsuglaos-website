import { serve } from '@hono/node-server';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the repo-root .env before anything reads process.env.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const { default: app } = await import('./app.js');

const port = Number(process.env.API_PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`API listening on http://localhost:${info.port}`);
	if (process.env.DEV_AUTH === 'true') {
		console.log('DEV_AUTH is on — authenticate with: Authorization: Bearer dev:<email>');
	}
});
