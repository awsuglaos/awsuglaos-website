import { adminApi } from '$lib/server/admin';
import { field } from '$lib/server/form';
import { isDomainError, siteFeedbackStatusSchema, type SiteFeedbackStatus } from '@awsug/shared';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminFeedbackEntry {
	id: string;
	name: string | null;
	email: string | null;
	subject: string | null;
	message: string;
	rating: number | null;
	status: SiteFeedbackStatus;
	locale: 'lo' | 'en';
	createdAt: string;
	reviewedAt: string | null;
	eventSlug: string | null;
}

/**
 * The tab is a query parameter rather than component state, so a triaged queue
 * survives a reload and an organiser can bookmark "everything still pending".
 */
export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	const requested = siteFeedbackStatusSchema.safeParse(url.searchParams.get('status'));
	const status: SiteFeedbackStatus = requested.success ? requested.data : 'pending';

	const entries = await adminApi(cookies, fetch).get<AdminFeedbackEntry[]>(
		`/admin/site-feedback?status=${status}`
	);

	return { entries, status };
};

/** Approve publishes it; archive keeps it and never shows it. */
async function setStatus(
	cookies: Parameters<typeof adminApi>[0],
	fetchFn: typeof fetch,
	data: FormData,
	status: SiteFeedbackStatus,
	message: string
) {
	const id = field(data, 'id');
	if (!id) return fail(400, { message: 'Invalid request' });

	try {
		await adminApi(cookies, fetchFn).put(`/admin/site-feedback/${id}/status`, { status });
	} catch (error) {
		if (isDomainError(error)) return fail(error.status, { message: error.message });
		throw error;
	}

	return { message };
}

export const actions: Actions = {
	approve: async ({ request, cookies, fetch }) =>
		setStatus(cookies, fetch, await request.formData(), 'approved', 'Published to the site.'),

	archive: async ({ request, cookies, fetch }) =>
		setStatus(cookies, fetch, await request.formData(), 'archived', 'Archived.'),

	unpublish: async ({ request, cookies, fetch }) =>
		setStatus(cookies, fetch, await request.formData(), 'pending', 'Taken off the site.'),

	remove: async ({ request, cookies, fetch }) => {
		const id = field(await request.formData(), 'id');
		if (!id) return fail(400, { message: 'Invalid request' });

		try {
			await adminApi(cookies, fetch).del(`/admin/site-feedback/${id}`);
		} catch (error) {
			if (isDomainError(error)) return fail(error.status, { message: error.message });
			throw error;
		}

		return { message: 'Deleted.' };
	}
};
