import { adminApi } from '$lib/server/admin';
import { isDomainError } from '@awsug/shared';
import type { EventStats, FormAnalytics } from '@awsug/core';
import type { FeedbackAverages } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { AdminEventDetail } from '../+page.server';

interface AnalyticsResponse {
	analytics: FormAnalytics;
	stats: EventStats;
	feedback: FeedbackAverages;
	capacity: number;
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const client = adminApi(cookies, fetch);

	try {
		const [event, data] = await Promise.all([
			client.get<AdminEventDetail>(`/admin/events/${params.id}`),
			client.get<AnalyticsResponse>(`/admin/events/${params.id}/analytics`)
		]);

		return { event, ...data };
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};
