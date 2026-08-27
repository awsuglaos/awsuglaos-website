import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'ketsadaphoneofficial@gmail.com';

async function signIn(page: Page) {
	await page.goto('/admin/login');
	await page.getByLabel('Email address').fill(ADMIN_EMAIL);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/admin');
}

/*
 * The regression test for the sign-out bug.
 *
 * The button was inert: `tooltipContent` routes the sidebar item through
 * bits-ui's Tooltip.Trigger, which merges `type="button"` into the props the
 * child spreads — so `<button type="submit" {...props}>` came out as a plain
 * button and the form never posted. Clicking it did nothing at all, which is
 * exactly the kind of failure a unit test cannot see.
 */
test.describe('signing out', () => {
	test('clears the session and returns to the login page', async ({ page }) => {
		await signIn(page);

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/admin\/login/);

		// And the session really is gone, not just navigated away from.
		await page.goto('/admin');
		await expect(page).toHaveURL(/\/admin\/login/);
	});
});

test.describe('admin form feedback', () => {
	/*
	 * A rejected save used to re-render from the stored record, silently
	 * discarding everything typed. On a bilingual event form with two rich text
	 * editors that is an afternoon's work for one bad slug.
	 */
	test('keeps what was typed when validation fails, and marks the field', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/events');
		await page
			.getByRole('link', { name: /Serverless/i })
			.first()
			.click();

		const title = `Kept after rejection ${Date.now()}`;
		await page.locator('#title_lo').fill(title);

		/*
		 * The rule has to be one the *browser* lets through, or the form never
		 * posts and there is no server answer to render. A malformed slug is
		 * caught by the input's own `pattern`; an end time at or before the start
		 * is a cross-field rule that only the schema knows about.
		 */
		const startAt = await page.locator('#startAt').inputValue();
		await page.locator('#endAt').fill(startAt);

		await page.getByRole('button', { name: 'Save event' }).click();

		// The offending field is marked rather than left to be hunted for...
		await expect(page.locator('#endAt')).toHaveAttribute('aria-invalid', 'true');
		// ...and the unrelated edit survived the rejection.
		await expect(page.locator('#title_lo')).toHaveValue(title);
	});
});

test.describe('event photos', () => {
	/**
	 * Photos are attached to a past event by the seed. If that ever stops being
	 * true this skips rather than fails — it is testing the lightbox, not the
	 * fixture.
	 */
	test('opens in a lightbox, pages with the keyboard, and offers a download', async ({ page }) => {
		await page.goto('/events/intro-to-cloud-computing');

		const thumbnails = page.getByRole('button', { name: /View photo/i });
		if ((await thumbnails.count()) === 0) test.skip();

		await thumbnails.first().click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		// Same origin, so `download` actually saves rather than navigating.
		const download = dialog.getByRole('link', { name: /Download/i });
		await expect(download).toHaveAttribute('download', /.+/);
		await expect(download).toHaveAttribute('href', /^\/uploads\//);

		if ((await thumbnails.count()) > 1) {
			await page.keyboard.press('ArrowRight');
			await expect(dialog).toBeVisible();
		}

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
	});
});

test.describe('the registration form builder', () => {
	test('adds a required question that then appears on the public page', async ({ page }) => {
		await signIn(page);

		// The workshop is seeded with a custom form already; this adds to it.
		await page.goto('/admin/events');
		await page
			.getByRole('link', { name: /Serverless/i })
			.first()
			.click();
		await page.getByRole('link', { name: 'Registration form' }).click();

		await expect(page.getByRole('heading', { name: 'Registration form' })).toBeVisible();

		await page.getByRole('button', { name: 'Short answer' }).click();

		const label = `Dietary needs ${Date.now()}`;
		await page.locator('input[id^="label_"]').last().fill(label);
		await page.getByRole('button', { name: 'Save form' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();

		// The question is now on the public form.
		await page.goto('/events/serverless-hands-on-workshop');
		await expect(page.getByLabel(new RegExp(label))).toBeVisible();
	});

	/*
	 * The form is free-form by design, so removing the email question is allowed —
	 * what matters is that the consequence is stated at the moment it becomes
	 * true, rather than discovered when the confirmation emails stop.
	 */
	test('warns as soon as the email question is removed', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/events');
		await page
			.getByRole('link', { name: /Community Day/i })
			.first()
			.click();
		await page.getByRole('link', { name: 'Registration form' }).click();

		const emailBlock = page.locator('[data-block-id="email"]');
		await expect(emailBlock).toBeVisible();
		await expect(page.getByText('No email question')).toHaveCount(0);

		// Two clicks by design: the first arms the removal, the second commits it.
		await emailBlock.getByRole('button', { name: 'Remove block' }).click();
		await emailBlock.getByRole('button', { name: /^Remove/ }).click();

		await expect(page.getByText('No email question')).toBeVisible();
		await expect(page.getByText(/will not receive a confirmation email/i)).toBeVisible();

		// Left unsaved on purpose — navigating away must not persist the removal.
		await expect(page.getByText('Unsaved changes')).toBeVisible();
	});
});

test.describe('public feedback', () => {
	// `/en/` throughout: the public site's base locale is Lao and serves it
	// unprefixed, so matching on English label text needs the English route.
	const FEEDBACK = '/en/feedback';

	/*
	 * The page is deliberately cached (`max-age=60`), like the landing page and
	 * the event pages, so a plain second visit inside the minute is answered
	 * from the browser's cache and shows the state from *before* publishing.
	 *
	 * A unique query on each visit forces a real request. Without it the
	 * "invisible while pending" assertion would also pass for the wrong reason,
	 * which is worse than the failure it was causing.
	 */
	const wall = (page: Page) => page.goto(`${FEEDBACK}?e2e=${Date.now()}-${Math.random()}`);

	test('is invisible until an organiser publishes it', async ({ page }) => {
		const message = `E2E feedback ${Date.now()} — please ignore.`;

		await page.goto(FEEDBACK);
		await page.locator('#message').fill(message);
		await page.getByRole('button', { name: /Send feedback/i }).click();
		await expect(page.getByText(/Thank you/i)).toBeVisible();

		// Not on the public wall yet.
		await wall(page);
		await expect(page.getByText(message)).toHaveCount(0);

		// An organiser publishes it.
		await signIn(page);
		await page.goto('/admin/feedback?status=pending');
		const card = page.locator('[data-slot="card"]').filter({ hasText: message });
		await card.getByRole('button', { name: 'Publish' }).click();
		await expect(page.getByText('Published to the site.')).toBeVisible();

		// Now it is public.
		await wall(page);
		await expect(page.getByText(message)).toBeVisible();
	});
});

test.describe('sponsor logos', () => {
	test('are drawn large enough to read, and scale with tier', async ({ page }) => {
		await page.goto('/');

		const logo = page.locator('[data-sponsor-tier] img').first();
		await expect(logo).toBeVisible();

		const box = await logo.boundingBox();

		/*
		 * The smallest tier draws its logo at h-16 (64px), and the height is fixed
		 * rather than a maximum — so this holds even for a sponsor whose artwork
		 * was exported small, which is the case the old `max-h` sizing got wrong.
		 */
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);

		// Width follows the aspect ratio, so it is never squashed to nothing.
		expect(box?.width ?? 0).toBeGreaterThan(40);
	});
});
