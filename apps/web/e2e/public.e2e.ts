import { expect, test, type Page } from '@playwright/test';

test.describe('public site', () => {
	test('landing page renders in Lao by default', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'lo');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('AWS');
	});

	test('language toggle keeps the reader on the same page', async ({ page }) => {
		await page.goto('/events');
		await page.getByRole('link', { name: 'English' }).click();
		await expect(page).toHaveURL(/\/en\/events$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
	});

	/*
	 * The toggle is a plain link, so a click before the router has taken over is a
	 * document navigation — which would show the right language for the wrong reason
	 * and make the two tests below pass on a build where nothing was fixed. SvelteKit
	 * stamps `sveltekit:history` into `history.state` when it starts, so this is the
	 * signal that the next click will be intercepted.
	 */
	async function routerReady(page: Page) {
		await page.waitForFunction(
			() => !!(history.state as Record<string, unknown> | null)?.['sveltekit:history']
		);
	}

	/*
	 * The regression this guards is subtle enough to be worth stating: `hooks.ts` reroutes
	 * both languages onto one route with identical params, so the URL is the only thing
	 * that differs between them. A `load` that took its locale from paraglide's
	 * `getLocale()` — resolved through AsyncLocalStorage, invisible to SvelteKit — declared
	 * no dependency on the language, so the client judged the node still valid, skipped the
	 * `__data.json` request entirely and re-rendered the previous language's rows. The
	 * static strings still swapped, which is what made it look like a rendering glitch
	 * rather than a stale load. Assert on a database column, never on a message key.
	 */
	test('switching language re-fetches database content without a reload', async ({ page }) => {
		await page.goto('/en/events');
		await routerReady(page);

		// `event_translations.locationName`. The two locales share no substring, so a
		// stale render cannot pass by coincidence.
		await expect(page.getByText('National Convention Centre, Vientiane').first()).toBeVisible();

		// Survives a client-side navigation, does not survive a document swap.
		await page.evaluate(() => {
			(window as Window & { __sameDocument?: true }).__sameDocument = true;
		});

		await page.getByRole('link', { name: 'ພາສາລາວ' }).first().click();

		await expect(page).toHaveURL(/\/events$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'lo');

		// The database-backed strings swap...
		await expect(page.getByText('ຫໍປະຊຸມແຫ່ງຊາດ, ວຽງຈັນ').first()).toBeVisible();
		await expect(page.getByText('AWS Community Day ວຽງຈັນ 2026').first()).toBeVisible();
		// ...and the English ones are replaced, not merely joined.
		await expect(page.getByText('National Convention Centre, Vientiane')).toHaveCount(0);

		// ...and the document was never thrown away.
		expect(
			await page.evaluate(() => (window as Window & { __sameDocument?: true }).__sameDocument)
		).toBe(true);
	});

	/*
	 * /news failed the same way for a different reason, so it needs its own case: it reads
	 * `url.searchParams`, which records only the individual params it asked for. A path
	 * prefix change produces an empty search diff, so the finer-grained tracking made the
	 * page look covered while leaving it exactly as stale.
	 */
	test('switching language re-fetches a filtered news list', async ({ page }) => {
		await page.goto('/en/news?q=AWS');
		await routerReady(page);
		await expect(page.getByText('Recap: AWS Community Day 2025').first()).toBeVisible();

		await page.getByRole('link', { name: 'ພາສາລາວ' }).first().click();

		await expect(page).toHaveURL(/\/news\?q=AWS$/);
		await expect(page.getByText('ສະຫຼຸບງານ AWS Community Day 2025').first()).toBeVisible();
	});

	test('event detail shows schedule and a registration form', async ({ page }) => {
		await page.goto('/en/events');
		await page
			.getByRole('link', { name: /AWS Community Day/ })
			.first()
			.click();

		await expect(page.getByRole('heading', { level: 1 })).toContainText('AWS Community Day');
		await expect(page.getByLabel('Full name')).toBeVisible();
		await expect(page.getByLabel('Email address')).toBeVisible();
	});

	test('event page emits valid, escaped JSON-LD', async ({ page }) => {
		await page.goto('/en/events/aws-community-day-vientiane-2026');

		const raw = await page.locator('script[type="application/ld+json"]').textContent();
		expect(raw).toBeTruthy();

		// Must parse — a broken escape would corrupt it.
		const parsed = JSON.parse(raw!);
		expect(parsed['@type']).toBe('Event');
		expect(parsed.name).toContain('AWS Community Day');
		expect(parsed.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		// And no raw "<" survived into the inlined JSON.
		expect(raw).not.toContain('<');
	});

	test('sitemap lists both locales with alternates', async ({ request }) => {
		const response = await request.get('/sitemap.xml');
		expect(response.ok()).toBeTruthy();

		const xml = await response.text();
		expect(xml).toContain('hreflang="lo"');
		expect(xml).toContain('hreflang="en"');
		expect(xml).toContain('/en/events');

		// The directory and each profile, both locales.
		expect(xml).toContain('/speakers</loc>');
		expect(xml).toContain('/en/speakers</loc>');
		expect(xml).toContain('/speakers/somchai-vongphachanh');
	});

	test('speaker directory groups the team above the guests', async ({ page }) => {
		await page.goto('/en/speakers');

		// `exact` throughout: the name matcher is substring-based, so a bare
		// 'Leader' also matches the 'Co-leader' heading.
		await expect(page.getByRole('heading', { name: 'Community leaders', level: 2 })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Leader', level: 3, exact: true })
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Co-leader', level: 3, exact: true })
		).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Somchai Vongphachanh', exact: true })
		).toBeVisible();
	});

	test('speaker profile emits valid, escaped Person JSON-LD', async ({ page }) => {
		await page.goto('/en/speakers/somchai-vongphachanh');

		await expect(page.getByRole('heading', { level: 1 })).toContainText('Somchai Vongphachanh');

		const raw = await page.locator('script[type="application/ld+json"]').textContent();
		expect(raw).toBeTruthy();

		const parsed = JSON.parse(raw!);
		expect(parsed['@type']).toBe('Person');
		expect(parsed.name).toBe('Somchai Vongphachanh');
		expect(parsed.memberOf.name).toBe('AWS User Group Lao');

		// Same guard as the event page: no raw "<" survived into the inlined JSON.
		expect(raw).not.toContain('<');
	});

	test('an event line-up links through to the speaker profile', async ({ page }) => {
		await page.goto('/en/events/aws-community-day-vientiane-2026');
		// `exact`: the card's social links are named "<speaker> on LinkedIn" and so
		// match the bare name as a substring.
		await page.getByRole('link', { name: 'Somchai Vongphachanh', exact: true }).click();
		await expect(page).toHaveURL(/\/en\/speakers\/somchai-vongphachanh$/);
	});

	test('an unknown speaker returns 404', async ({ page }) => {
		const response = await page.goto('/en/speakers/does-not-exist');
		expect(response?.status()).toBe(404);
	});

	test('unknown page returns a localized 404', async ({ page }) => {
		const response = await page.goto('/en/news/does-not-exist');
		expect(response?.status()).toBe(404);
		await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
	});

	test('draft articles are not publicly reachable', async ({ page }) => {
		// Seeded as a draft — it must never appear on the public site.
		const response = await page.goto('/en/news/event-roadmap-2026');
		expect(response?.status()).toBe(404);
	});
});
