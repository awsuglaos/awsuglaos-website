import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'ketsadaphoneofficial@gmail.com';

/** The editable surface of a specific RichTextEditor instance. */
function richText(page: Page, name: string) {
	return page.locator(`[data-editor="${name}"] .ProseMirror`);
}

async function signIn(page: Page) {
	await page.goto('/admin/login');
	await page.getByLabel('Email address').fill(ADMIN_EMAIL);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/admin');
}

test.describe('backoffice', () => {
	test('requires sign-in', async ({ page }) => {
		await page.goto('/admin/events');
		await expect(page).toHaveURL(/\/admin\/login/);
	});

	test('rejects an account with no user row', async ({ page }) => {
		await page.goto('/admin/login');
		await page.getByLabel('Email address').fill('stranger@example.la');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByText(/not authorised/i)).toBeVisible();
	});

	test('dashboard shows registration and check-in totals', async ({ page }) => {
		await signIn(page);
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
		// Exact: "Registrations per event" is a heading further down the page.
		await expect(page.getByText('Registrations', { exact: true })).toBeVisible();
		await expect(page.getByRole('table')).toBeVisible();
	});

	/** The core editorial loop: a draft stays hidden until it is published. */
	test('creates a draft, publishes it, and it appears publicly', async ({ page }) => {
		const slug = `e2e-post-${Date.now()}`;
		await signIn(page);

		await page.goto('/admin/articles/new');
		await page.getByLabel('Slug').fill(slug);
		await page.locator('#title_lo').fill('ຫົວຂໍ້ທົດສອບ');
		await page.locator('#title_en').fill('E2E Draft Post');

		// Rich text is a ProseMirror surface, not a textarea — type into it.
		await richText(page, 'content_lo').fill('ເນື້ອໃນ');
		await richText(page, 'content_en').fill('Draft body.');

		await page.getByRole('button', { name: 'Create article' }).click();

		await expect(page).toHaveURL(/\/admin\/articles\/[0-9a-f-]{36}$/);
		const editUrl = page.url();

		// Still a draft — the public route must 404.
		const draftResponse = await page.request.get(`/en/news/${slug}`);
		expect(draftResponse.status()).toBe(404);

		await page.locator('#status').selectOption('published');
		await page.getByRole('button', { name: 'Save article' }).click();
		// Saving confirms with a toast rather than an inline banner.
		await expect(page.getByText('Saved.')).toBeVisible();

		await page.goto(`/en/news/${slug}`);
		await expect(page.getByRole('heading', { name: 'E2E Draft Post' })).toBeVisible();
		// The stored document survived the round trip and rendered as real markup.
		await expect(page.locator('article p', { hasText: 'Draft body.' })).toBeVisible();

		// Clean up so repeat runs stay independent. Navigate by URL rather than by
		// link text: the admin list shows the Lao title, not the English one.
		await page.goto(editUrl);
		// Deleting is guarded by an AlertDialog, not window.confirm: the trigger
		// opens the dialog, and the button inside it commits.
		await page.getByRole('button', { name: 'Delete article' }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Delete article' })
			.click();
		await expect(page).toHaveURL('/admin/articles');
	});

	test('checks a ticket in and refuses the second scan', async ({ page }) => {
		const email = `e2e-checkin-${Date.now()}@example.la`;

		await page.goto('/en/events/aws-community-day-vientiane-2026');
		await page.getByLabel('Full name').fill('Check In Person');
		await page.getByLabel('Email address').fill(email);
		await page.getByRole('button', { name: 'Complete registration' }).click();
		await expect(page).toHaveURL(/\/ticket\/([A-Z0-9]{26})$/);

		const ticket = page.url().split('/').pop()!;

		await signIn(page);
		await page.goto('/admin/checkin');

		await page.getByPlaceholder('01KZN5CRFP…').fill(ticket);
		await page.getByRole('button', { name: 'Check in' }).click();
		await expect(page.getByText('Check In Person')).toBeVisible();

		await page.getByPlaceholder('01KZN5CRFP…').fill(ticket);
		await page.getByRole('button', { name: 'Check in' }).click();
		await expect(page.getByText(/already been checked in/i)).toBeVisible();
	});

	test('exports registrants as CSV', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/events');
		await page.getByRole('link', { name: 'Registrants' }).first().click();

		const download = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Export CSV' }).click();
		const file = await download;

		expect(file.suggestedFilename()).toMatch(/\.csv$/);
	});
});
