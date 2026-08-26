import { z } from 'zod';
import { emailSchema, idSchema, text } from '../primitives.js';

const ratingSchema = z.coerce
	.number()
	.int('Choose a rating')
	.min(1, 'Choose a rating')
	.max(5, 'Choose a rating');

export const feedbackInputSchema = z.object({
	overallRating: ratingSchema,
	// Optional so a hurried attendee can leave one star rating and go.
	venueRating: ratingSchema.optional(),
	contentRating: ratingSchema.optional(),
	whatWentWell: text(0, 4000, 'Response').optional(),
	whatToImprove: text(0, 4000, 'Response').optional(),
	/** Consent to quoting the comments publicly. Defaults to no. */
	allowPublic: z
		.union([z.boolean(), z.literal('on'), z.literal('true'), z.literal('false')])
		.optional()
		.transform((v) => v === true || v === 'on' || v === 'true'),
	/** Honeypot — see registration.ts. */
	website: z.string().max(0, 'Rejected').optional()
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export interface FeedbackAverages {
	responses: number;
	overall: number | null;
	venue: number | null;
	content: number | null;
	/** Responses as a percentage of registrations. */
	responseRate: number;
}

/* -------------------------------------------------------------------------- */
/* Public site feedback                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Feedback sent by anyone visiting the site, as opposed to the per-ticket
 * feedback above.
 *
 * Deliberately a separate table and a separate schema. The two answer different
 * questions — "how was the event you attended?" versus "here is something you
 * should know" — and only one of them is tied to a registration, gated on the
 * event being over, or limited to one response per person. Sharing a table
 * would mean every query about either had to remember which it was looking at.
 */
export const SITE_FEEDBACK_STATUSES = ['pending', 'approved', 'archived'] as const;
export const siteFeedbackStatusSchema = z.enum(SITE_FEEDBACK_STATUSES);
export type SiteFeedbackStatus = z.infer<typeof siteFeedbackStatusSchema>;

export const siteFeedbackInputSchema = z.object({
	/** Optional: an unsigned note is still worth reading. */
	name: text(1, 120, 'Name').optional(),
	/** Only so an organiser can reply. Never published, whatever the status. */
	email: emailSchema.optional(),
	subject: text(1, 200, 'Subject').optional(),
	message: text(10, 4000, 'Message'),
	rating: ratingSchema.optional(),
	/** Set when the visitor is writing about a specific event. */
	eventId: idSchema.optional(),
	/** Honeypot — see registration.ts. */
	website: z.string().max(0, 'Rejected').optional()
});

export type SiteFeedbackInput = z.infer<typeof siteFeedbackInputSchema>;

export const setSiteFeedbackStatusInputSchema = z.object({
	status: siteFeedbackStatusSchema
});

export type SetSiteFeedbackStatusInput = z.infer<typeof setSiteFeedbackStatusInputSchema>;
