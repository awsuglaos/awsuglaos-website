import { expect, test } from '@playwright/test';

const EVENT = '/en/events/aws-community-day-vientiane-2026';

/** Unique per run so repeat runs do not collide with the unique email index. */
function uniqueEmail(): string {
	return `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.la`;
}

test.describe('event registration', () => {
	test('registers and issues a ticket with a QR code', async ({ page }) => {
		const email = uniqueEmail();

		await page.goto(EVENT);
		await page.getByLabel('Full name').fill('E2E Attendee');
		await page.getByLabel('Email address').fill(email);
		await page.getByRole('button', { name: 'Complete registration' }).click();

		// POST-redirect-GET lands on the ticket page.
		await expect(page).toHaveURL(/\/ticket\/[A-Z0-9]{26}$/);
		await expect(page.getByRole('heading', { name: 'You are registered' })).toBeVisible();
		await expect(page.getByText('E2E Attendee')).toBeVisible();

		// The QR is inline SVG rendered on the server, not an <img> to S3.
		const qr = page.locator('svg[shape-rendering="crispEdges"]');
		await expect(qr).toBeVisible();

		await expect(page.getByText('Not yet checked in')).toBeVisible();
	});

	test('rejects a second registration with the same email', async ({ page }) => {
		const email = uniqueEmail();

		for (const attempt of [1, 2]) {
			await page.goto(EVENT);
			await page.getByLabel('Full name').fill('Duplicate Person');
			await page.getByLabel('Email address').fill(attempt === 1 ? email : email.toUpperCase());
			await page.getByRole('button', { name: 'Complete registration' }).click();

			if (attempt === 1) {
				await expect(page).toHaveURL(/\/ticket\//);
			}
		}

		// Second attempt stays on the event page with an explanation, and the
		// match is case-insensitive.
		await expect(page).toHaveURL(new RegExp(`${EVENT}$`));
		await expect(page.getByText(/already registered/i)).toBeVisible();
	});

	test('shows validation errors instead of submitting', async ({ page }) => {
		await page.goto(EVENT);
		await page.getByLabel('Full name').fill('A');
		await page.getByLabel('Email address').fill('someone@example.la');
		await page.getByRole('button', { name: 'Complete registration' }).click();

		await expect(page.getByText(/at least 2 characters/i)).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`${EVENT}$`));
	});
});
