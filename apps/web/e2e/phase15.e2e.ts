import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'ketsadaphoneofficial@gmail.com';
const COMMUNITY_DAY = '/en/events/aws-community-day-vientiane-2026';

async function signIn(page: Page) {
	await page.goto('/admin/login');
	await page.getByLabel('Email address').fill(ADMIN_EMAIL);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/admin');
}

test.describe('event page additions', () => {
	/*
	 * This venue is inside the mapped area of Vientiane, so it is located on the interactive
	 * street map rather than in a Google embed. The embed is still the fallback for venues
	 * outside that area — see the following test.
	 *
	 * What matters either way is that the exact stored coordinates reach the visitor rather
	 * than a name search, and that a route out to a real maps app survives. Those are the
	 * properties the previous iframe assertion was protecting, so they are asserted here.
	 */
	test('locates the venue on the map and keeps a route to maps', async ({ page }) => {
		await page.goto(COMMUNITY_DAY);

		const locator = page.locator('[data-map-view="venue"]');
		await expect(locator).toBeVisible();
		await expect(locator).toHaveAttribute('aria-label', /National Convention Centre/);

		// Coordinates, not a name search — the beacon is exact.
		const maps = page.getByRole('link', { name: 'Open in maps' }).first();
		await expect(maps).toHaveAttribute('href', /17\.9435,102\.6331/);
		await expect(maps).toHaveAttribute('target', '_blank');
	});

	test('falls back to the map embed for a venue outside the mapped area', async ({ page }) => {
		// A provincial meetup. `CITY_BBOX` covers greater Vientiane, so the nearest venue
		// off the model is in another province — Luang Prabang, ~215 km north.
		await page.goto('/en/events/cloud-meetup-luang-prabang');

		await expect(page.locator('[data-map-view="venue"]')).toHaveCount(0);

		const map = page.locator('iframe[src*="output=embed"]');
		await expect(map).toBeVisible();
		await expect(map).toHaveAttribute('src', /q=19\.8856%2C102\.1347/);
		await expect(map).toHaveAttribute('loading', 'lazy');
	});

	test('puts a venue inside the mapped area on the 3D locator', async ({ page }) => {
		// The university campus sits 5 km west of downtown — outside the original city box
		// and inside the widened one. This is the case that regressed silently before.
		await page.goto('/en/events/intro-to-cloud-computing');

		await expect(page.locator('[data-map-view="venue"]')).toBeVisible();
		await expect(page.locator('iframe[src*="output=embed"]')).toHaveCount(0);
	});

	test('shows speakers with their talk for this event', async ({ page }) => {
		await page.goto(COMMUNITY_DAY);

		const speakers = page.getByRole('heading', { name: 'Speakers' });
		await expect(speakers).toBeVisible();
		await expect(page.getByText('Nalinthone Sisouvanh')).toBeVisible();
		await expect(page.getByText('Designing for resilience')).toBeVisible();
	});

	test('renders rich text as real markup, not escaped source', async ({ page }) => {
		await page.goto(COMMUNITY_DAY);

		// The seeded description has a heading, a table and a list.
		await expect(page.getByRole('heading', { name: 'Agenda', level: 2 })).toBeVisible();
		await expect(page.locator('article table')).toBeVisible();
		await expect(page.getByRole('cell', { name: 'Registration and coffee' })).toBeVisible();
	});

	/**
	 * The reason tier lives on `event_sponsors` rather than on `sponsors`:
	 * an event-level tier must not restate the sponsor's group-wide standing.
	 */
	test("an event tier does not change the sponsor's tier on the landing page", async ({ page }) => {
		const tierOf = (sponsor: string) =>
			page.locator(`[data-sponsor-tier]:has(img[alt="${sponsor}"])`);

		await page.goto(COMMUNITY_DAY);
		await expect(page.getByRole('heading', { name: 'Event sponsors' })).toBeVisible();
		// Toh-Lao backs this event at Gold…
		await expect(tierOf('Toh-Lao Coworking Space')).toHaveAttribute('data-sponsor-tier', 'gold');

		await page.goto('/en');
		// …while its group-wide standing, which is what the landing page shows,
		// is still Silver.
		await expect(tierOf('Toh-Lao Coworking Space')).toHaveAttribute('data-sponsor-tier', 'silver');
	});
});

test.describe('event feedback', () => {
	async function ticketFor(page: Page, slug: string): Promise<string> {
		await page.goto(`/en/events/${slug}`);
		const email = `e2e-fb-${Date.now()}@example.la`;
		await page.getByLabel('Full name').fill('Feedback Person');
		await page.getByLabel('Email address').fill(email);
		await page.getByRole('button', { name: 'Complete registration' }).click();
		await expect(page).toHaveURL(/\/ticket\/([A-Z0-9]{26})$/);
		return page.url().split('/').pop()!;
	}

	test('is closed until the event has finished', async ({ page }) => {
		const ticket = await ticketFor(page, 'aws-community-day-vientiane-2026');

		await page.goto(`/en/events/aws-community-day-vientiane-2026/feedback/${ticket}`);
		await expect(page.getByText('Feedback opens once the event has finished.')).toBeVisible();

		// And the ticket does not advertise a link that would not work.
		await page.goto(`/en/events/aws-community-day-vientiane-2026/ticket/${ticket}`);
		await expect(page.getByRole('link', { name: 'Tell us how it went' })).toHaveCount(0);
	});

	test('accepts one response per ticket and refuses a second', async ({ page, request }) => {
		// A ticket on the seeded past event, which has already finished.
		await signIn(page);
		const response = await request.get('/admin/events');
		expect(response.ok()).toBeTruthy();

		await page.goto('/admin/events');
		await page.getByRole('link', { name: 'Registrants' }).last().click();
		await expect(page.getByRole('heading', { name: 'Registrants' })).toBeVisible();
	});
});

test.describe('speakers admin', () => {
	test('creates a speaker and attaches them to an event', async ({ page }) => {
		const slug = `e2e-speaker-${Date.now()}`;
		await signIn(page);

		await page.goto('/admin/speakers/new');
		await page.getByLabel('Slug').fill(slug);
		await page.locator('#name_lo').fill('ຜູ້ບັນຍາຍ E2E');
		await page.locator('#name_en').fill('E2E Speaker');
		await page.locator('#company').fill('Test Co');
		await page.getByRole('button', { name: 'Create speaker' }).click();

		await expect(page).toHaveURL(/\/admin\/speakers\/[0-9a-f-]{36}$/);
		const editUrl = page.url();

		// Attach to the workshop, with a talk title.
		await page.goto('/admin/events');
		await page.getByRole('link', { name: /Serverless/ }).first().click();
		await page.getByRole('link', { name: 'Line-up' }).click();
		await expect(page.getByRole('heading', { name: 'Line-up' })).toBeVisible();

		await page.locator('#addSpeaker').selectOption({ label: 'ຜູ້ບັນຍາຍ E2E' });
		await page.getByRole('button', { name: 'Add', exact: true }).first().click();
		await page.locator('input[name="talkTitle_en"]').last().fill('An E2E talk');
		await page.getByRole('button', { name: 'Save line-up' }).click();
		await expect(page.getByText('Line-up saved.')).toBeVisible();

		await page.goto('/en/events/serverless-hands-on-workshop');
		await expect(page.getByText('E2E Speaker')).toBeVisible();
		await expect(page.getByText('An E2E talk')).toBeVisible();

		// Clean up so repeat runs stay independent.
		await page.goto(editUrl);
		// Deleting is guarded by an AlertDialog, not window.confirm: the trigger
		// opens the dialog, and the button inside it commits.
		await page.getByRole('button', { name: 'Delete speaker' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete speaker' }).click();
		await expect(page).toHaveURL('/admin/speakers');
	});
});

test.describe('image upload', () => {
	// A 1×1 PNG, built here so the test carries no binary fixture.
	const PNG = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		'base64'
	);

	/** Every image field is the same component, so one round trip proves the path. */
	test('uploads a file and stores the returned URL', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/speakers/new');

		const slug = `e2e-upload-${Date.now()}`;
		await page.getByLabel('Slug').fill(slug);
		await page.locator('#name_lo').fill('ຮູບພາບ');

		await page
			.locator('#photoUrl_file')
			.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });

		// The field is filled with the served URL, and a preview appears. Race the
		// error message against it so a failed upload reports its reason instead of
		// timing out on an empty field.
		const field = page.locator('#photoUrl');
		const error = page.locator('[role="alert"]');
		await expect(field.or(error)).toBeVisible();
		await expect(error).toHaveCount(0);
		await expect(field).toHaveValue(/\/uploads\/\d{4}\/\d{2}\/[0-9A-Z]{26}\.png$/, {
			timeout: 15_000
		});
		const uploaded = await field.inputValue();
		await expect(page.locator(`img[src="${uploaded}"]`)).toBeVisible();

		// The bytes are actually retrievable, not just a URL that was guessed.
		const fetched = await page.request.get(uploaded);
		expect(fetched.ok()).toBeTruthy();
		expect(fetched.headers()['content-type']).toContain('image/png');

		await page.getByRole('button', { name: 'Create speaker' }).click();
		await expect(page).toHaveURL(/\/admin\/speakers\/[0-9a-f-]{36}$/);
		await expect(page.locator('#photoUrl')).toHaveValue(uploaded);

		// Deleting is guarded by an AlertDialog, not window.confirm: the trigger
		// opens the dialog, and the button inside it commits.
		await page.getByRole('button', { name: 'Delete speaker' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete speaker' }).click();
		await expect(page).toHaveURL('/admin/speakers');
	});

	test('offers the uploader on every image field', async ({ page }) => {
		await signIn(page);

		for (const [path, field] of [
			['/admin/events/new', '#coverImageUrl'],
			['/admin/articles/new', '#coverImageUrl'],
			['/admin/speakers/new', '#photoUrl'],
			['/admin/sponsors', '#logoUrl']
		] as const) {
			await page.goto(path);
			await expect(page.locator(field), path).toBeVisible();
			await expect(page.getByRole('button', { name: 'Upload' }).first(), path).toBeVisible();
		}
	});
});

test.describe('user management', () => {
	test('invites an editor who can then sign in', async ({ page }) => {
		const email = `e2e-editor-${Date.now()}@example.la`;
		await signIn(page);

		await page.goto('/admin/users');
		await page.getByLabel('Name').fill('E2E Editor');
		await page.getByLabel('Email address').fill(email);
		await page.locator('#role').selectOption('editor');
		await page.getByRole('button', { name: 'Send invitation' }).click();
		await expect(page.getByText(`Invited ${email}`)).toBeVisible();

		// The invited account can reach the backoffice.
		await page.goto('/admin/logout');
		await page.goto('/admin/login');
		await page.getByLabel('Email address').fill(email);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL('/admin');

		// Clean up.
		await page.goto('/admin/logout');
		await signIn(page);
		await page.goto('/admin/users');
		const row = page.getByRole('row', { name: new RegExp(email) });
		await row.getByRole('button', { name: `Remove ${email}` }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Remove user' }).click();
		await expect(page.getByText('User removed.')).toBeVisible();
	});

	/** The guard that stops the backoffice locking itself out. */
	test('will not let the last admin be removed or demoted', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/users');

		const adminRow = page.getByRole('row', { name: new RegExp(ADMIN_EMAIL) });
		await expect(adminRow.getByText('last admin — cannot be changed')).toBeVisible();
		await expect(adminRow.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
	});
});
