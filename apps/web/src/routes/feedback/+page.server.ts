import { getLocale } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { field, isBot } from '$lib/server/form';
import { siteFeedbackService } from '@awsug/core';
import { siteFeedbackInputSchema } from '@awsug/shared';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	const ctx = await getContext();

	// Only approved messages are ever selected, so there is no way for this page
	// to leak the queue by forgetting a filter.
	const entries = await siteFeedbackService.listApprovedFeedback(ctx, { limit: 50 });

	setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=300' });
	return { entries };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		if (isBot(data)) {
			// A plausible success, with nothing written.
			return { sent: true };
		}

		const parsed = siteFeedbackInputSchema.safeParse({
			name: field(data, 'name'),
			email: field(data, 'email'),
			subject: field(data, 'subject'),
			message: field(data, 'message'),
			rating: field(data, 'rating')
		});

		if (!parsed.success) {
			const fieldErrors: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = String(issue.path[0] ?? '');
				if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
			}

			return fail(400, {
				fieldErrors,
				values: {
					name: field(data, 'name') ?? '',
					email: field(data, 'email') ?? '',
					subject: field(data, 'subject') ?? '',
					message: field(data, 'message') ?? ''
				}
			});
		}

		try {
			await siteFeedbackService.submitSiteFeedback(await getContext(), parsed.data, getLocale());
		} catch (error) {
			console.error('Site feedback submission failed', error);
			return fail(500, { failed: true });
		}

		/*
		 * No redirect: unlike registration there is nothing to send the visitor to,
		 * and a thank-you rendered in place is the whole result. A refresh re-posts,
		 * which at worst files a duplicate into a queue a person is already reading.
		 */
		return { sent: true };
	}
};
