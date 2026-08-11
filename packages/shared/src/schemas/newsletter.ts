import { z } from 'zod';
import { localeSchema } from '../locale.js';
import { emailSchema } from '../primitives.js';

export const newsletterInputSchema = z.object({
	email: emailSchema,
	locale: localeSchema.optional(),
	/** Honeypot — see registration.ts. */
	website: z.string().max(0, 'Rejected').optional()
});

export type NewsletterInput = z.infer<typeof newsletterInputSchema>;

export const newsletterUnsubscribeSchema = z.object({
	token: z.string().min(16).max(64)
});
