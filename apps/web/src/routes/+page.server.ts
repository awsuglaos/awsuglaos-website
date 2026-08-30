import { getContext } from '$lib/server/context';
import { localeOf } from '$lib/server/locale';
import {
	articleService,
	eventService,
	siteFeedbackService,
	speakerService,
	sponsorService
} from '@awsug/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const ctx = await getContext();
	const locale = localeOf(url);

	const [upcoming, latest, sponsors, team, pastCount, feedback] = await Promise.all([
		eventService.listPublishedEvents(ctx, { locale, when: 'upcoming', limit: 3 }),
		articleService.listPublishedArticles(ctx, { locale, limit: 3 }),
		sponsorService.listSponsors(ctx),
		// Only the people who run the group — guest speakers live on /speakers.
		speakerService.listPublicSpeakers(ctx, { locale, team: true }),
		eventService.listPublishedEvents(ctx, { locale, when: 'past' }).then((e) => e.length),
		// Approved only, and only the three most recent — the band is a taste of
		// the feedback page, not a second copy of it.
		siteFeedbackService.listApprovedFeedback(ctx, { limit: 3 })
	]);

	// Public content changes rarely; let CloudFront serve it and revalidate in the
	// background so a cold Aurora resume is never in a visitor's critical path.
	setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=600' });

	return { upcoming, latest, sponsors, team, pastCount, feedback };
};
