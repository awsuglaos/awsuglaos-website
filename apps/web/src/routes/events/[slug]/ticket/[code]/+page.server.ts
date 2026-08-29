import { getLocale } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { registrationService } from '@awsug/core';
import { isDomainError } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const ctx = await getContext();

	let ticket;
	try {
		ticket = await registrationService.getRegistrationByTicket(ctx, params.code);
	} catch (err) {
		if (isDomainError(err) && err.code === 'not_found') error(404, 'Ticket not found');
		throw err;
	}

	if (ticket.event.slug !== params.slug) error(404, 'Ticket not found');

	/*
	 * The QR is rendered here as inline SVG rather than stored as a PNG in S3:
	 * nothing to clean up, no broken links if a ticket is reissued, and it prints
	 * crisply at any size. The payload is the bare ticket code — uppercase
	 * alphanumeric, so the encoder uses its compact alphanumeric mode.
	 *
	 * Null unless the registration is approved. On an approval event the ticket
	 * URL is live from the moment somebody registers, but the code only means
	 * something once a decision has been made — encoding one for a pending
	 * applicant would hand a scannable pass to somebody with no place. The page
	 * shows them where they stand instead.
	 */
	const qrSvg =
		ticket.registration.status !== 'approved'
			? null
			: await QRCode.toString(ticket.registration.ticketCode, {
					type: 'svg',
					margin: 1,
					errorCorrectionLevel: 'M',
					color: { dark: '#000000', light: '#ffffff' }
				});

	// A ticket is personal data behind an unguessable URL — never cache it in a
	// shared cache, and keep it out of search results.
	setHeaders({ 'cache-control': 'private, no-store' });

	const translation =
		(await ctx.db.query.eventTranslations.findFirst({
			where: (t, { and, eq }) => and(eq(t.eventId, ticket.event.id), eq(t.locale, getLocale()))
		})) ??
		(await ctx.db.query.eventTranslations.findFirst({
			where: (t, { eq }) => eq(t.eventId, ticket.event.id)
		}));

	return {
		// The feedback form only opens after the event ends, so the link is only
		// worth showing from that point.
		feedbackOpen: ticket.event.endAt <= new Date(),
		registration: {
			fullName: ticket.registration.fullName,
			email: ticket.registration.email,
			ticketCode: ticket.registration.ticketCode,
			status: ticket.registration.status,
			checkedInAt: ticket.registration.checkedInAt
		},
		event: {
			slug: ticket.event.slug,
			startAt: ticket.event.startAt,
			endAt: ticket.event.endAt,
			title: translation?.title ?? ticket.event.slug,
			locationName: translation?.locationName ?? ''
		},
		qrSvg
	};
};
