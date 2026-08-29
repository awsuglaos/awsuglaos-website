import type { Registrant } from '$lib/registrant';
import { adminApi } from '$lib/server/admin';
import { field } from '$lib/server/form';
import { isDomainError, registrationStatusSchema } from '@awsug/shared';
import { error, fail } from '@sveltejs/kit';
import type { AdminEventDetail } from '../+page.server';
import type { Actions, PageServerLoad } from './$types';

interface Stats {
	registered: number;
	pending: number;
	rejected: number;
	checkedIn: number;
	checkInRate: number;
}

export const load: PageServerLoad = async ({ params, url, cookies, fetch }) => {
	const client = adminApi(cookies, fetch);

	/*
	 * The filter lives in the URL rather than in component state so a decision
	 * can redirect back to the queue the organiser was working through, and so
	 * "pending" is a link somebody can bookmark. An unparseable value falls back
	 * to showing everything, which is a safe answer to a bad filter.
	 */
	const requested = registrationStatusSchema.safeParse(url.searchParams.get('status'));
	const status = requested.success ? requested.data : undefined;

	try {
		const [event, registrations, stats] = await Promise.all([
			client.get<AdminEventDetail>(`/admin/events/${params.id}`),
			client.get<Registrant[]>(
				`/admin/events/${params.id}/registrations${status ? `?status=${status}` : ''}`
			),
			client.get<Stats>(`/admin/events/${params.id}/stats`)
		]);

		return { event, registrations, stats, status };
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};

/**
 * One action for both decisions, and for one row or forty.
 *
 * The bulk and single-row controls post the same shape — a repeated `id` field
 * — so there is one path to get right rather than two that can disagree.
 */
async function review(
	cookies: Parameters<typeof adminApi>[0],
	fetchFn: typeof fetch,
	eventId: string,
	data: FormData,
	decision: 'approved' | 'rejected'
) {
	const ids = data.getAll('id').filter((v): v is string => typeof v === 'string' && v !== '');
	if (ids.length === 0) return fail(400, { message: 'Select at least one registration.' });

	const note = field(data, 'note');

	try {
		const result = await adminApi(cookies, fetchFn).post<{
			approved: number;
			rejected: number;
			skipped: number;
		}>(`/admin/events/${eventId}/registrations/review`, {
			ids,
			decision,
			...(decision === 'rejected' && note ? { note } : {})
		});

		const decided = decision === 'approved' ? result.approved : result.rejected;
		const verb = decision === 'approved' ? 'Approved' : 'Rejected';

		/*
		 * Approving more people than the room holds stops at the capacity line
		 * rather than overselling, so the count that got through has to be
		 * reported — "done" would be a lie about the ones that did not.
		 */
		return {
			message: result.skipped
				? `${verb} ${decided}. ${result.skipped} skipped — the event is full, or they were already there.`
				: `${verb} ${decided}.`
		};
	} catch (error_) {
		if (isDomainError(error_)) return fail(error_.status, { message: error_.message });
		throw error_;
	}
}

export const actions: Actions = {
	approve: async ({ request, params, cookies, fetch }) =>
		review(cookies, fetch, params.id, await request.formData(), 'approved'),
	reject: async ({ request, params, cookies, fetch }) =>
		review(cookies, fetch, params.id, await request.formData(), 'rejected')
};
