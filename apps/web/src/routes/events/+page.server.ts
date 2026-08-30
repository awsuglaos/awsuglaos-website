import { getContext } from '$lib/server/context';
import { localeOf } from '$lib/server/locale';
import { eventService } from '@awsug/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const ctx = await getContext();
	const locale = localeOf(url);

	const [upcoming, past] = await Promise.all([
		eventService.listPublishedEvents(ctx, { locale, when: 'upcoming' }),
		eventService.listPublishedEvents(ctx, { locale, when: 'past' })
	]);

	setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=600' });

	return { upcoming, past };
};
