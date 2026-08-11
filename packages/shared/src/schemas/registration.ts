import { z } from 'zod';
import { emailSchema, idSchema, phoneSchema, text } from '../primitives.js';

/**
 * Public registration form. This endpoint is an unauthenticated write, so it
 * carries a honeypot alongside the server-side rate limiting — see the security
 * notes in the plan.
 */
export const registrationInputSchema = z.object({
	fullName: text(2, 120, 'Full name'),
	email: emailSchema,
	/** Optional: organisers use it for day-of contact only, so we do not force it. */
	phone: phoneSchema.optional(),
	organisation: text(0, 160, 'Organisation').optional(),
	/** Honeypot — real users never see this field, so any value means a bot. */
	website: z.string().max(0, 'Rejected').optional()
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

export const checkInInputSchema = z.object({
	ticketCode: text(1, 64, 'Ticket code')
});

export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const registrationSchema = z.object({
	id: idSchema,
	eventId: idSchema,
	fullName: z.string(),
	email: z.string(),
	phone: z.string().nullable(),
	organisation: z.string().nullable(),
	ticketCode: z.string(),
	checkedInAt: z.date().nullable(),
	createdAt: z.date()
});

export type Registration = z.infer<typeof registrationSchema>;
