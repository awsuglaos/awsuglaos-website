import { z } from 'zod';
import { idSchema, text } from '../primitives.js';

/*
 * There is no fixed registration input schema any more. The questions an event
 * asks are its own — see packages/shared/src/schemas/form.ts — and the schema
 * that validates a submission is built from that definition by
 * `buildAnswersSchema`. What used to live here is now the DEFAULT_FORM_BLOCKS
 * constant, which is only a starting point an organiser is free to change.
 */

/*
 * Approval is per event. `requiresApproval` on the event decides whether a new
 * registration lands as `pending` or straight at `approved`; the default in the
 * database is `approved`, so every event that never opts in — and every row
 * written before this existed — behaves exactly as it always did.
 */
export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const registrationStatusSchema = z.enum(REGISTRATION_STATUSES);
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;

/** Only a person can move a registration, and only to a decided state. */
export const reviewDecisionSchema = z.enum(['approved', 'rejected']);
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const reviewRegistrationsInputSchema = z.object({
	// Capped because this is one transaction and one email per row. A queue
	// bigger than this wants a job, not a form post.
	ids: z.array(idSchema).min(1, 'Select at least one registration').max(200),
	decision: reviewDecisionSchema,
	/** Shown to the applicant in the rejection email when present. */
	note: text(1, 500, 'Note').optional()
});

export type ReviewRegistrationsInput = z.infer<typeof reviewRegistrationsInputSchema>;

export const checkInInputSchema = z.object({
	ticketCode: text(1, 64, 'Ticket code')
});

export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const registrationSchema = z.object({
	id: idSchema,
	eventId: idSchema,
	fullName: z.string().nullable(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	organisation: z.string().nullable(),
	ticketCode: z.string(),
	status: registrationStatusSchema,
	reviewedAt: z.date().nullable(),
	reviewNote: z.string().nullable(),
	checkedInAt: z.date().nullable(),
	createdAt: z.date()
});

export type Registration = z.infer<typeof registrationSchema>;
