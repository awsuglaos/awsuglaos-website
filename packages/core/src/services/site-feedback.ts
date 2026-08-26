import { events, siteFeedback, type SiteFeedbackRow } from '@awsug/db';
import {
	NotFoundError,
	type Locale,
	type SiteFeedbackInput,
	type SiteFeedbackStatus
} from '@awsug/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';

/**
 * Feedback sent from the public site, and the queue an organiser triages it in.
 *
 * Every submission lands as `pending` and nothing reads it publicly until
 * somebody approves it. That gate is the spam control: an unauthenticated write
 * that can never reach a visitor's screen unaided is not worth a spammer's
 * time, and the honeypot on the form turns away the rest.
 */

export interface SiteFeedbackView {
	id: string;
	name: string | null;
	subject: string | null;
	message: string;
	rating: number | null;
	createdAt: Date;
	/** The event it is about, when the visitor named one. */
	eventTitle: string | null;
	eventSlug: string | null;
}

export interface AdminSiteFeedbackEntry extends SiteFeedbackView {
	/** Never published. Present in the backoffice so an organiser can reply. */
	email: string | null;
	status: SiteFeedbackStatus;
	locale: Locale;
	reviewedAt: Date | null;
}

export async function submitSiteFeedback(
	ctx: AppContext,
	input: SiteFeedbackInput,
	locale: Locale
): Promise<SiteFeedbackRow> {
	const [created] = await ctx.db
		.insert(siteFeedback)
		.values({
			name: input.name ?? null,
			email: input.email ?? null,
			subject: input.subject ?? null,
			message: input.message,
			rating: input.rating ?? null,
			eventId: input.eventId ?? null,
			locale,
			// Never taken from the caller. A public endpoint that could choose its
			// own moderation state would not be a moderation queue.
			status: 'pending'
		})
		.returning();

	if (!created) throw new Error('Site feedback insert returned no row');
	return created;
}

/** What the public `/feedback` page and the landing band show. */
export async function listApprovedFeedback(
	ctx: AppContext,
	options: { limit?: number; locale?: Locale } = {}
): Promise<SiteFeedbackView[]> {
	const rows = await ctx.db
		.select({
			feedback: siteFeedback,
			eventSlug: events.slug
		})
		.from(siteFeedback)
		.leftJoin(events, eq(events.id, siteFeedback.eventId))
		.where(eq(siteFeedback.status, 'approved'))
		.orderBy(desc(siteFeedback.createdAt))
		.limit(options.limit ?? 50);

	return rows.map((row) => ({
		id: row.feedback.id,
		name: row.feedback.name,
		subject: row.feedback.subject,
		message: row.feedback.message,
		rating: row.feedback.rating,
		createdAt: row.feedback.createdAt,
		// The title needs a translation lookup and is not worth a second query
		// for a testimonial card; the slug is what makes it a link.
		eventTitle: null,
		eventSlug: row.eventSlug
	}));
}

/* -------------------------------------------------------------------------- */
/* Backoffice                                                                 */
/* -------------------------------------------------------------------------- */

export async function listSiteFeedback(
	ctx: AppContext,
	status?: SiteFeedbackStatus
): Promise<AdminSiteFeedbackEntry[]> {
	const rows = await ctx.db
		.select({ feedback: siteFeedback, eventSlug: events.slug })
		.from(siteFeedback)
		.leftJoin(events, eq(events.id, siteFeedback.eventId))
		.where(status ? eq(siteFeedback.status, status) : undefined)
		.orderBy(desc(siteFeedback.createdAt))
		.limit(500);

	return rows.map((row) => ({
		id: row.feedback.id,
		name: row.feedback.name,
		email: row.feedback.email,
		subject: row.feedback.subject,
		message: row.feedback.message,
		rating: row.feedback.rating,
		status: row.feedback.status,
		locale: row.feedback.locale,
		createdAt: row.feedback.createdAt,
		reviewedAt: row.feedback.reviewedAt,
		eventTitle: null,
		eventSlug: row.eventSlug
	}));
}

/** How many are waiting. Drives the badge on the sidebar. */
export async function countPendingFeedback(ctx: AppContext): Promise<number> {
	const [row] = await ctx.db
		.select({ count: sql<number>`count(*)::int` })
		.from(siteFeedback)
		.where(eq(siteFeedback.status, 'pending'));

	return row?.count ?? 0;
}

/**
 * Approving is what publishes; archiving is what files it away unpublished.
 *
 * Who decided, and when, is recorded — a moderation queue where nobody is
 * accountable for what went live is not one.
 */
export async function setSiteFeedbackStatus(
	ctx: AppContext,
	id: string,
	status: SiteFeedbackStatus,
	reviewerId: string
): Promise<SiteFeedbackRow> {
	const [updated] = await ctx.db
		.update(siteFeedback)
		.set({ status, reviewedBy: reviewerId, reviewedAt: currentTime(ctx) })
		.where(eq(siteFeedback.id, id))
		.returning();

	if (!updated) throw new NotFoundError('Feedback');
	return updated;
}

export async function deleteSiteFeedback(ctx: AppContext, id: string): Promise<void> {
	const deleted = await ctx.db
		.delete(siteFeedback)
		.where(and(eq(siteFeedback.id, id)))
		.returning({ id: siteFeedback.id });

	if (deleted.length === 0) throw new NotFoundError('Feedback');
}
