import { z } from 'zod';
import { text } from '../primitives.js';

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
