import { getLocale, localizeHref } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { field, isBot, toFormFailure } from '$lib/server/form';
import { eventService, registrationService, speakerService, sponsorService } from '@awsug/core';
import { isDomainError, registrationInputSchema } from '@awsug/shared';
import { error, fail, redirect } from '@sveltejs/kit';
// `Actions` from ./$types carries the route's real params ({ slug: string });
// the one exported from @sveltejs/kit widens them to string | undefined.
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const ctx = await getContext();

	const locale = getLocale();

	try {
		const event = await eventService.getPublishedEventBySlug(ctx, params.slug, locale);

		const [speakers, sponsors] = await Promise.all([
			speakerService.listEventSpeakers(ctx, event.id, locale),
			sponsorService.listEventSponsors(ctx, event.id)
		]);

		setHeaders({ 'cache-control': 'public, max-age=30, stale-while-revalidate=300' });
		return { event, speakers, sponsors };
	} catch (err) {
		if (isDomainError(err) && err.code === 'not_found') error(404, 'Event not found');
		throw err;
	}
};

export const actions: Actions = {
	register: async ({ request, params }) => {
		const data = await request.formData();

		if (isBot(data)) {
			// Look like a success without writing anything.
			redirect(303, localizeHref(`/events/${params.slug}`));
		}

		const parsed = registrationInputSchema.safeParse({
			fullName: field(data, 'fullName'),
			email: field(data, 'email'),
			phone: field(data, 'phone'),
			organisation: field(data, 'organisation')
		});

		if (!parsed.success) {
			const fieldErrors: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
			}
			return fail(400, {
				fieldErrors,
				values: {
					fullName: field(data, 'fullName') ?? '',
					email: field(data, 'email') ?? '',
					phone: field(data, 'phone') ?? '',
					organisation: field(data, 'organisation') ?? ''
				}
			});
		}

		let ticketCode: string;
		try {
			const ctx = await getContext();
			const result = await registrationService.registerForEvent(
				ctx,
				params.slug,
				parsed.data,
				getLocale()
			);
			ticketCode = result.registration.ticketCode;
		} catch (err) {
			return toFormFailure(err);
		}

		// POST-redirect-GET: a refresh on the ticket page must not re-submit.
		redirect(303, localizeHref(`/events/${params.slug}/ticket/${ticketCode}`));
	}
};
