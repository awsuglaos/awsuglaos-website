/*
 * Renders the still images that stand in for the city model.
 *
 *   pnpm run dev            # in one terminal
 *   node scripts/generate-city-posters.mjs [url]
 *
 * These are not loading spinners. They are what the model *is* for anyone without WebGL2,
 * on a browser that lost its context, or in the moments before the worker has finished
 * extruding — so they are rendered from the real scene rather than drawn by hand, and they
 * are server-rendered into the page so the hero is never an empty box and the largest
 * paint never waits on JavaScript.
 *
 * One per theme, because this project switches themes with a `.dark` class rather than a
 * media query: a visitor who picked dark while their OS is light must not get the light
 * poster under a dark page.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (name) => join(root, 'static', name);

const url = process.argv[2] ?? 'http://localhost:5199/en';

/* Wide enough that the poster still crops well on an ultrawide hero. */
const VIEWPORT = { width: 1800, height: 1100 };

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage({
		viewport: VIEWPORT,
		deviceScaleFactor: 1,
		// The rise animation must actually run, or the poster shows a flat plate.
		reducedMotion: 'no-preference'
	});

	console.log(`Loading ${url} …`);
	await page.goto(url, { waitUntil: 'domcontentloaded' });

	const model = page.locator('[data-map-view="country"]');
	await model.waitFor({ state: 'visible', timeout: 60_000 });
	await page.waitForFunction(
		() => document.querySelector('[data-map-view="country"]')?.dataset.mapReady === 'true',
		null,
		{ timeout: 60_000 }
	);

	for (const theme of ['light', 'dark']) {
		await page.evaluate((mode) => {
			document.documentElement.classList.toggle('dark', mode === 'dark');
		}, theme);

		// Long enough for the assembly sweep and the palette crossfade to settle.
		await page.waitForTimeout(3200);

		const png = await model.locator('canvas').screenshot({ type: 'png' });
		const name = `map-poster-${theme}.webp`;
		/*
		 * Quality 82 on a matte, low-frequency render is visually lossless and lands around
		 * 60 KB. The audience is largely on Lao mobile data; a 300 KB hero still is a real
		 * cost to them and an invisible gain to everyone else.
		 */
		const webp = await sharp(png).webp({ quality: 82, effort: 6 }).toBuffer();
		await writeFile(out(name), webp);
		console.log(`  ${name.padEnd(30)} ${(webp.byteLength / 1024).toFixed(0).padStart(4)} KB`);
	}

	await browser.close();
}

await main();
