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

	/*
	 * This used to submit a one-character name and expect "at least 2
	 * characters". That rule is gone: with the form built per event, how long an
	 * answer must be is the organiser's business, and the builder enforces only
	 * that a required question is answered at all. A one-letter name is also a
	 * real name in more places than the old rule allowed for.
	 *
	 * The property under test is unchanged — a rejected submission renders its
	 * error inline and stays on the page — so it now uses a rule that does still
	 * exist. Phone is the right lever: `type="tel"` gets no free validation from
	 * the browser, so the value actually reaches the server.
	 */
	test('shows validation errors instead of submitting', async ({ page }) => {
		await page.goto(EVENT);
		await page.getByLabel('Full name').fill('E2E Attendee');
		await page.getByLabel('Email address').fill(uniqueEmail());
		await page.getByLabel(/Phone/).fill('not-a-phone-number');
		await page.getByRole('button', { name: 'Complete registration' }).click();

		await expect(page.getByText(/valid phone number/i)).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`${EVENT}$`));
	});
});
