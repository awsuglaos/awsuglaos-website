import { adminApi } from '$lib/server/admin';
import { isDomainError, type FeedbackAverages } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface FeedbackRow {
	id: string;
	attendeeName: string;
	overallRating: number;
	venueRating: number | null;
	contentRating: number | null;
	whatWentWell: string | null;
	whatToImprove: string | null;
	allowPublic: boolean;
	createdAt: string;
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const client = adminApi(cookies, fetch);

	try {
		const [event, feedback] = await Promise.all([
			client.get<{ id: string; slug: string; translations: { locale: string; title: string }[] }>(
				`/admin/events/${params.id}`
			),
			client.get<{ entries: FeedbackRow[]; averages: FeedbackAverages }>(
				`/admin/events/${params.id}/feedback`
			)
		]);

		return { event, entries: feedback.entries, averages: feedback.averages };
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};
