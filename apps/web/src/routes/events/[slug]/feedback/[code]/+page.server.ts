import * as m from '$lib/paraglide/messages';
import { getContext } from '$lib/server/context';
import { field, isBot } from '$lib/server/form';
import { localeOf } from '$lib/server/locale';
import { feedbackService } from '@awsug/core';
import { feedbackInputSchema, isDomainError } from '@awsug/shared';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	const ctx = await getContext();
	// Read before the query: the URL is what declares this load's dependency
	// on the language, and a read from inside the closure below would be too late.
	const locale = localeOf(url);

	// Personal data behind an unguessable URL — never cached, never indexed.
	setHeaders({ 'cache-control': 'private, no-store' });

	try {
		const target = await feedbackService.resolveFeedbackTarget(ctx, params.slug, params.code);
		const translation =
			(await ctx.db.query.eventTranslations.findFirst({
				where: (t, { and, eq }) => and(eq(t.eventId, target.event.id), eq(t.locale, locale))
			})) ??
			(await ctx.db.query.eventTranslations.findFirst({
				where: (t, { eq }) => eq(t.eventId, target.event.id)
			}));

		return {
			eventTitle: translation?.title ?? target.event.slug,
			attendeeName: target.registration.fullName,
			alreadySubmitted: target.existing !== null
		};
	} catch (err) {
		if (isDomainError(err)) {
			if (err.code === 'not_found') error(404, 'Ticket not found');
			// The event has not finished yet — a real page, not an error.
			if (err.code === 'feedback_not_open') {
				return {
					notOpen: true as const,
					eventTitle: '',
					attendeeName: '',
					alreadySubmitted: false
				};
			}
		}
		throw err;
	}
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const data = await request.formData();
		if (isBot(data)) return { submitted: true };

		const parsed = feedbackInputSchema.safeParse({
			overallRating: field(data, 'overallRating'),
			venueRating: field(data, 'venueRating'),
			contentRating: field(data, 'contentRating'),
			whatWentWell: field(data, 'whatWentWell'),
			whatToImprove: field(data, 'whatToImprove'),
			allowPublic: field(data, 'allowPublic')
		});

		if (!parsed.success) {
			return fail(400, { message: m.feedback_rating_required() });
		}

		try {
			const ctx = await getContext();
			await feedbackService.submitFeedback(ctx, params.slug, params.code, parsed.data);
			return { submitted: true };
		} catch (err) {
			if (isDomainError(err)) {
				const message =
					err.code === 'feedback_already_submitted'
						? m.feedback_already()
						: err.code === 'feedback_not_open'
							? m.feedback_not_open()
							: m.register_error_generic();
				return fail(err.status, { message });
			}
			throw err;
		}
	}
};
