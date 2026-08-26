import { getLocale, localizeHref } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { isBot, toFormFailure } from '$lib/server/form';
import { eventService, registrationService, speakerService, sponsorService } from '@awsug/core';
import { isDomainError, isQuestion, type FormDefinition } from '@awsug/shared';
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

/**
 * Reads the answers out of the posted form.
 *
 * Driven by the event's own form definition rather than by whatever field names
 * turned up in the body: a question that is not on the form cannot smuggle an
 * answer in, and one that is on it always gets a key, so "left blank" is
 * distinguishable from "not asked".
 */
function readAnswers(data: FormData, blocks: FormDefinition) {
	const answers: Record<string, unknown> = {};
	const values: Record<string, string | string[]> = {};

	for (const block of blocks) {
		if (!isQuestion(block)) continue;

		const name = `answer.${block.id}`;

		if (block.type === 'checkboxes') {
			const picked = data.getAll(name).map(String);
			answers[block.id] = picked;
			values[block.id] = picked;
			continue;
		}

		const raw = data.get(name);
		const value = typeof raw === 'string' ? raw : null;
		answers[block.id] = value;
		values[block.id] = value ?? '';
	}

	return { answers, values };
}

export const actions: Actions = {
	register: async ({ request, params }) => {
		const data = await request.formData();

		if (isBot(data)) {
			// Look like a success without writing anything.
			redirect(303, localizeHref(`/events/${params.slug}`));
		}

		const ctx = await getContext();
		const locale = getLocale();

		let event;
		try {
			event = await eventService.getPublishedEventBySlug(ctx, params.slug, locale);
		} catch (err) {
			if (isDomainError(err) && err.code === 'not_found') error(404, 'Event not found');
			throw err;
		}

		const { answers, values } = readAnswers(data, event.form);

		let ticketCode: string;
		try {
			const result = await registrationService.registerForEvent(
				ctx,
				params.slug,
				{ answers },
				locale
			);
			ticketCode = result.registration.ticketCode;
		} catch (err) {
			/*
			 * The service validates against the form as it stands and reports which
			 * question failed. Surfacing that here — rather than re-validating in
			 * the action — means the page marks the right field without the two
			 * layers being able to disagree about what "valid" means.
			 */
			if (isDomainError(err) && err.code === 'validation_failed') {
				const fieldErrors = (err.details?.fieldErrors ?? {}) as Record<string, string>;
				return fail(400, { fieldErrors, values });
			}
			return toFormFailure(err);
		}

		// POST-redirect-GET: a refresh on the ticket page must not re-submit.
		redirect(303, localizeHref(`/events/${params.slug}/ticket/${ticketCode}`));
	}
};
