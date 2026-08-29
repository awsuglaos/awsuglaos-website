import type { Answers, RegistrationStatus } from '@awsug/shared';

/**
 * A registration as the admin API hands it over.
 *
 * `listRegistrations` selects the whole row rather than a projection, so every
 * answer to the organiser's own questions has always been on this wire — the
 * page simply did not declare it, and so could not read it. Written down here
 * because the table and the detail panel both need it, and a shape that is
 * only half declared is one that drifts.
 */
export interface Registrant {
	id: string;
	fullName: string | null;
	email: string | null;
	phone: string | null;
	organisation: string | null;
	ticketCode: string;
	status: RegistrationStatus;
	reviewedAt: string | null;
	reviewNote: string | null;
	checkedInAt: string | null;
	createdAt: string;
	/** Keyed by question id. Questions since deleted are still in here. */
	answers: Answers;
}

/**
 * Blank, absent and "nothing ticked" all read the same to a person.
 *
 * Deliberately a copy of the same rule in `form-analytics.ts` rather than an
 * import: that module sits behind `@awsug/core`, whose barrel re-exports
 * drizzle and three AWS SDK clients, and none of that belongs in a browser
 * bundle for the sake of four lines.
 */
export const isAnswered = (value: unknown): boolean =>
	value !== null &&
	value !== undefined &&
	!(Array.isArray(value) && value.length === 0) &&
	!(typeof value === 'string' && value.trim() === '');
