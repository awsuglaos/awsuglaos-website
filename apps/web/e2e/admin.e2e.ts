import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'ketsadaphoneofficial@gmail.com';

/** The editable surface of a specific RichTextEditor instance. */
function richText(page: Page, name: string) {
	return page.locator(`[data-editor="${name}"] .ProseMirror`);
}

/**
 * The whole editor widget for one field — toolbar included.
 *
 * Scoped by the mount point's parent rather than by index: the bilingual forms
 * put two editors on the page, so an unscoped "Heading 2" button is ambiguous.
 */
function richTextToolbar(page: Page, name: string) {
	return page.locator(`div:has(> [data-editor="${name}"])`);
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
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete article' }).click();
		await expect(page).toHaveURL('/admin/articles');
	});

	/**
	 * The community role reaches the public site by two routes — the <select> on
	 * the speaker form and the order board — so one flow walks both.
	 *
	 * The board is driven by its chevrons rather than a pointer drag. Playwright
	 * can drive a real drag, but it is flaky across headless engines, and the
	 * chevrons are the keyboard path that has to keep working regardless.
	 */
	test('promotes a speaker, reorders the board, and it reaches the public page', async ({
		page
	}) => {
		await signIn(page);

		// Seeded as an organiser. The <select> is the path that still works with
		// JavaScript off, so it is the one worth covering.
		await page.goto('/admin/speakers');
		await page.getByRole('link', { name: 'ຄຳລ້າ ພິມມະສອນ' }).click();
		await page.getByLabel('Community role').selectOption('co_leader');
		await page.getByRole('button', { name: 'Save speaker' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();

		await page.goto('/admin/speakers/order');
		const coLeaders = page.getByRole('list', { name: 'Co-leader', exact: true });

		// Both hold sort order 0 after the promotion, so the slug breaks the tie:
		// khamla- sorts ahead of nalinthone-.
		await expect(coLeaders.getByRole('link')).toHaveText(['ຄຳລ້າ ພິມມະສອນ', 'ນະລິນທອນ ສີສຸວັນ']);

		await coLeaders.getByRole('button', { name: 'Move ນະລິນທອນ ສີສຸວັນ up' }).click();
		await page.getByRole('button', { name: 'Save order' }).click();
		await expect(page.getByText('Order saved.')).toBeVisible();

		// Surviving a reload is what separates a saved order from a moved div.
		await page.goto('/admin/speakers/order');
		await expect(
			page.getByRole('list', { name: 'Co-leader', exact: true }).getByRole('link')
		).toHaveText(['ນະລິນທອນ ສີສຸວັນ', 'ຄຳລ້າ ພິມມະສອນ']);

		// The public directory shows what the board was told.
		//
		// Asserted by href rather than by text: each card's link wraps the portrait
		// as well as the name, and until the photo loads bits-ui renders a fallback
		// initial inside it. The slug is the identity and no load race moves it.
		await page.goto('/en/speakers');
		const publicCoLeaders = page
			.getByRole('list', { name: 'Co-leader', exact: true })
			.getByRole('link');
		await expect(publicCoLeaders).toHaveCount(2);
		await expect(publicCoLeaders.nth(0)).toHaveAttribute(
			'href',
			/\/speakers\/nalinthone-sisouvanh$/
		);
		await expect(publicCoLeaders.nth(1)).toHaveAttribute('href', /\/speakers\/khamla-phimmasone$/);

		// A chevron at the edge of a zone changes the role rather than the
		// position, and says so rather than claiming to move them "down".
		await page.goto('/admin/speakers/order');
		await page
			.getByRole('list', { name: 'Co-leader', exact: true })
			.getByRole('button', { name: 'Move ຄຳລ້າ ພິມມະສອນ to Organiser' })
			.click();
		await page.getByRole('button', { name: 'Save order' }).click();
		await expect(page.getByText('Order saved.')).toBeVisible();

		await expect(
			page.getByRole('list', { name: 'Organiser', exact: true }).getByRole('link')
		).toHaveText(['ຄຳລ້າ ພິມມະສອນ']);
	});

	/**
	 * A bio is a TipTap document now, and it lands in two very different places:
	 * formatted on the profile, flattened and clamped on the line-up card of every
	 * event that person spoke at. One flow walks both.
	 */
	test('writes a formatted bio and renders it on the profile and the line-up', async ({ page }) => {
		await signIn(page);

		await page.goto('/admin/speakers');
		await page.getByRole('link', { name: 'ນະລິນທອນ ສີສຸວັນ' }).click();

		const bio = richText(page, 'bio_en');
		await bio.fill('E2E bio paragraph.');
		// A heading proves the bio is stored as structure, not as the text of
		// whatever the browser happened to render.
		await bio.press('Enter');
		await richTextToolbar(page, 'bio_en').getByRole('button', { name: 'Heading 2' }).click();
		await bio.pressSequentially('Credentials');

		await page.getByRole('button', { name: 'Save speaker' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();

		await page.goto('/en/speakers/nalinthone-sisouvanh');
		await expect(page.getByText('E2E bio paragraph.')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Credentials', level: 2 })).toBeVisible();

		// The line-up card falls back to the bio — this appearance has a talk title
		// but no abstract — and must show it flattened. The heading is text there,
		// not a second <h2> competing with the page's own headings.
		await page.goto('/en/events/aws-community-day-vientiane-2026');
		const card = page.getByRole('listitem').filter({ hasText: 'Nalinthone Sisouvanh' });
		await expect(card).toContainText('E2E bio paragraph.');
		await expect(card.getByRole('heading', { name: 'Credentials' })).toHaveCount(0);
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
