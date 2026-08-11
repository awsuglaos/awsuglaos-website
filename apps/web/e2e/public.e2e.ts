import { expect, test } from '@playwright/test';

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

	test('event detail shows schedule and a registration form', async ({ page }) => {
		await page.goto('/en/events');
		await page.getByRole('link', { name: /AWS Community Day/ }).first().click();

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
