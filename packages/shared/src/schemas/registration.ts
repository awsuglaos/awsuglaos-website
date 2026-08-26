import { z } from 'zod';
import { idSchema, text } from '../primitives.js';

/*
 * There is no fixed registration input schema any more. The questions an event
 * asks are its own — see packages/shared/src/schemas/form.ts — and the schema
 * that validates a submission is built from that definition by
 * `buildAnswersSchema`. What used to live here is now the DEFAULT_FORM_BLOCKS
 * constant, which is only a starting point an organiser is free to change.
 */

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
	checkedInAt: z.date().nullable(),
	createdAt: z.date()
});

export type Registration = z.infer<typeof registrationSchema>;
