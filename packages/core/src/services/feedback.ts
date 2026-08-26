import {
	eventFeedback,
	registrations,
	type Event,
	type EventFeedback,
	type RegistrationRow
} from '@awsug/db';
import {
	FeedbackAlreadySubmittedError,
	FeedbackNotOpenError,
	NotFoundError,
	type FeedbackAverages,
	type FeedbackInput
} from '@awsug/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';
import { isUniqueViolation } from '../util/db-errors.js';

export function buildFeedbackUrl(siteUrl: string, eventSlug: string, ticketCode: string): string {
	return `${siteUrl.replace(/\/$/, '')}/events/${eventSlug}/feedback/${ticketCode}`;
}

export interface FeedbackTarget {
	event: Event;
	registration: RegistrationRow;
	existing: EventFeedback | null;
}

/**
 * Resolves a feedback link to its event and registration, enforcing the two
 * rules that make the link safe to hand out: it must belong to this event, and
 * the event must be over.
 *
 * Deliberately *not* gated on check-in. A scanner failure or a queue that moved
 * too fast should not cost us an attendee's feedback — the ticket is proof
 * enough that they were invited.
 */
export async function resolveFeedbackTarget(
	ctx: AppContext,
	eventSlug: string,
	ticketCode: string
): Promise<FeedbackTarget> {
	const row = await ctx.db.query.registrations.findFirst({
		where: eq(registrations.ticketCode, ticketCode.trim().toUpperCase()),
		with: { event: true }
	});

	if (!row) throw new NotFoundError('Ticket');
	const { event } = row as { event: Event };
	if (event.slug !== eventSlug) throw new NotFoundError('Ticket');

	if (event.endAt > currentTime(ctx)) throw new FeedbackNotOpenError();

	const [existing] = await ctx.db
		.select()
		.from(eventFeedback)
		.where(eq(eventFeedback.registrationId, row.id))
		.limit(1);

	return { event, registration: row, existing: existing ?? null };
}

export async function submitFeedback(
	ctx: AppContext,
	eventSlug: string,
	ticketCode: string,
	input: FeedbackInput
): Promise<EventFeedback> {
	const target = await resolveFeedbackTarget(ctx, eventSlug, ticketCode);
	if (target.existing) throw new FeedbackAlreadySubmittedError();

	try {
		const [created] = await ctx.db
			.insert(eventFeedback)
			.values({
				eventId: target.event.id,
				registrationId: target.registration.id,
				overallRating: input.overallRating,
				venueRating: input.venueRating ?? null,
				contentRating: input.contentRating ?? null,
				whatWentWell: input.whatWentWell || null,
				whatToImprove: input.whatToImprove || null,
				allowPublic: input.allowPublic
			})
			.returning();

		if (!created) throw new Error('Feedback insert returned no row');
		return created;
	} catch (error) {
		// Two tabs, one ticket. The unique index is the real guarantee; this turns
		// it into the right message.
		if (isUniqueViolation(error)) throw new FeedbackAlreadySubmittedError();
		throw error;
	}
}

export interface FeedbackEntry extends EventFeedback {
	/** Null when the event's form has no question tagged as the name. */
	attendeeName: string | null;
}

export async function listFeedback(ctx: AppContext, eventId: string): Promise<FeedbackEntry[]> {
	const rows = await ctx.db
		.select({
			feedback: eventFeedback,
			attendeeName: registrations.fullName
		})
		.from(eventFeedback)
		.innerJoin(registrations, eq(registrations.id, eventFeedback.registrationId))
		.where(eq(eventFeedback.eventId, eventId))
		.orderBy(desc(eventFeedback.createdAt));

	return rows.map((r) => ({ ...r.feedback, attendeeName: r.attendeeName }));
}

export async function getFeedbackAverages(
	ctx: AppContext,
	eventId: string
): Promise<FeedbackAverages> {
	const [stats] = await ctx.db
		.select({
			responses: sql<number>`count(*)::int`,
			overall: sql<number | null>`avg(${eventFeedback.overallRating})`,
			venue: sql<number | null>`avg(${eventFeedback.venueRating})`,
			content: sql<number | null>`avg(${eventFeedback.contentRating})`
		})
		.from(eventFeedback)
		.where(eq(eventFeedback.eventId, eventId));

	const [registered] = await ctx.db
		.select({ count: sql<number>`count(*)::int` })
		.from(registrations)
		.where(eq(registrations.eventId, eventId));

	const responses = stats?.responses ?? 0;
	const total = registered?.count ?? 0;

	// Postgres returns numeric averages as strings through some drivers; round
	// to one decimal so the admin UI never renders 4.333333333.
	const round = (value: number | string | null | undefined): number | null =>
		value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10;

	return {
		responses,
		overall: round(stats?.overall),
		venue: round(stats?.venue),
		content: round(stats?.content),
		responseRate: total === 0 ? 0 : Math.round((responses / total) * 100)
	};
}
