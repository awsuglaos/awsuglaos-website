import { events, registrations, type Event, type RegistrationRow } from '@awsug/db';
import {
	AlreadyCheckedInError,
	AlreadyRegisteredError,
	answerForRole,
	buildAnswersSchema,
	EventFullError,
	isQuestion,
	NotFoundError,
	RegistrationClosedError,
	ValidationFailedError,
	generateTicketCode,
	type Answers,
	type CheckInInput,
	type FormDefinition,
	type Locale,
	type QuestionBlock
} from '@awsug/shared';
import { and, asc, eq, gt, isNotNull, or, sql } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';
import { registrationConfirmationEmail } from '../email/templates.js';
import { isUniqueViolation } from '../util/db-errors.js';
import { pickTranslation } from '../util/translation.js';
import { deriveRegistrationState } from './events.js';

export interface RegistrationResult {
	registration: RegistrationRow;
	ticketUrl: string;
}

export function buildTicketUrl(siteUrl: string, eventSlug: string, ticketCode: string): string {
	return `${siteUrl.replace(/\/$/, '')}/events/${eventSlug}/ticket/${ticketCode}`;
}

/** What the visitor submitted, keyed by question id. Unvalidated. */
export interface RegistrationSubmission {
	answers: Record<string, unknown>;
}

/**
 * Claims a seat and records the registration.
 *
 * The seat is claimed by a single conditional UPDATE rather than a read-then-
 * write. Under concurrent requests Postgres serialises the row update, and each
 * waiting statement re-evaluates its WHERE clause against the newly committed
 * row — so the capacity test cannot be passed by two callers at once. Wrapping
 * it with the INSERT means a duplicate-email rejection rolls the claimed seat
 * back automatically, with no compensating write to get wrong.
 *
 * The answers are validated here, against the form as it exists *now*, rather
 * than trusting whatever the caller checked. The web action validates first as
 * well so it can mark the offending question; this is the check that decides.
 */
export async function registerForEvent(
	ctx: AppContext,
	eventSlug: string,
	input: RegistrationSubmission,
	locale: Locale
): Promise<RegistrationResult> {
	const now = currentTime(ctx);

	const event = await ctx.db.query.events.findFirst({
		where: eq(events.slug, eventSlug),
		with: { translations: true }
	});
	if (!event) throw new NotFoundError('Event');

	const form = event.formSchema;
	const parsed = buildAnswersSchema(form).safeParse(input.answers);
	if (!parsed.success) {
		const fieldErrors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path.map(String).join('.');
			if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
		}
		throw new ValidationFailedError(fieldErrors);
	}

	const answers = parsed.data;

	/*
	 * The four columns below are a mirror of whichever questions carry the
	 * matching role, so tickets, the confirmation email, the check-in list and
	 * the CSV export keep reading one column each. Any of them can be null: the
	 * form is free-form, and an organiser may have deleted that question.
	 */
	const name = answerForRole(form, answers, 'name');
	const email = answerForRole(form, answers, 'email');
	const phone = answerForRole(form, answers, 'phone');
	const organisation = answerForRole(form, answers, 'organisation');

	const registration = await ctx.db.transaction(async (tx) => {
		const claimed = await tx
			.update(events)
			.set({
				registeredCount: sql`${events.registeredCount} + 1`,
				updatedAt: now
			})
			.where(
				and(
					eq(events.id, event.id),
					// Re-checked inside the same statement, so a talk that closes or
					// unpublishes mid-request cannot leak an extra registration.
					eq(events.status, 'published'),
					gt(events.startAt, now),
					or(eq(events.capacity, 0), sql`${events.registeredCount} < ${events.capacity}`)
				)
			)
			.returning({ id: events.id });

		if (claimed.length === 0) {
			// Nothing was claimed — re-read to report *why* rather than a generic error.
			const [current] = await tx.select().from(events).where(eq(events.id, event.id)).limit(1);
			if (!current) throw new NotFoundError('Event');

			const state = deriveRegistrationState(current, now);
			if (state === 'full') throw new EventFullError();
			throw new RegistrationClosedError();
		}

		try {
			const [row] = await tx
				.insert(registrations)
				.values({
					eventId: event.id,
					fullName: name,
					email,
					phone,
					organisation,
					answers,
					ticketCode: generateTicketCode()
				})
				.returning();

			if (!row) throw new Error('Registration insert returned no row');
			return row;
		} catch (error) {
			// The (event_id, lower(email)) unique index fired. Rolling back releases
			// the seat claimed above.
			if (isUniqueViolation(error)) throw new AlreadyRegisteredError();
			throw error;
		}
	});

	const ticketUrl = buildTicketUrl(ctx.siteUrl, event.slug, registration.ticketCode);
	const translation = pickTranslation(event.translations, locale);

	/*
	 * No email question on this form means no address to send to, and that is a
	 * legitimate configuration rather than a failure — the ticket still exists
	 * and its URL is shown on the confirmation page. The builder warns the
	 * organiser at the point they remove the question.
	 *
	 * Sent after the transaction commits: a mail failure must not undo a valid
	 * registration, and SES latency should not hold a database transaction open.
	 */
	if (registration.email) {
		try {
			const template = registrationConfirmationEmail({
				locale,
				fullName: registration.fullName ?? registration.ticketCode,
				eventTitle: translation?.title ?? event.slug,
				startAt: event.startAt,
				locationName: translation?.locationName ?? '',
				ticketCode: registration.ticketCode,
				ticketUrl
			});
			await ctx.email.send({ to: registration.email, ...template });
		} catch (error) {
			console.error('Confirmation email failed', {
				registrationId: registration.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return { registration, ticketUrl };
}

/* -------------------------------------------------------------------------- */
/* Check-in                                                                   */
/* -------------------------------------------------------------------------- */

export interface CheckInResult {
	registration: RegistrationRow;
	event: Event;
}

export async function checkIn(ctx: AppContext, input: CheckInInput): Promise<CheckInResult> {
	const now = currentTime(ctx);
	const code = input.ticketCode.trim().toUpperCase();

	const existing = await ctx.db.query.registrations.findFirst({
		where: eq(registrations.ticketCode, code),
		with: { event: true }
	});
	if (!existing) throw new NotFoundError('Ticket');
	if (existing.checkedInAt) throw new AlreadyCheckedInError(existing.checkedInAt);

	// Conditional update: two scanners hitting the same ticket at once means the
	// second sees zero rows rather than silently overwriting the first timestamp.
	const [updated] = await ctx.db
		.update(registrations)
		.set({ checkedInAt: now })
		.where(and(eq(registrations.id, existing.id), sql`${registrations.checkedInAt} IS NULL`))
		.returning();

	if (!updated) {
		const [fresh] = await ctx.db
			.select()
			.from(registrations)
			.where(eq(registrations.id, existing.id))
			.limit(1);
		throw new AlreadyCheckedInError(fresh?.checkedInAt ?? now);
	}

	return { registration: updated, event: (existing as { event: Event }).event };
}

export async function getRegistrationByTicket(
	ctx: AppContext,
	ticketCode: string
): Promise<{ registration: RegistrationRow; event: Event }> {
	const row = await ctx.db.query.registrations.findFirst({
		where: eq(registrations.ticketCode, ticketCode.trim().toUpperCase()),
		with: { event: true }
	});
	if (!row) throw new NotFoundError('Ticket');
	return { registration: row, event: (row as { event: Event }).event };
}

/* -------------------------------------------------------------------------- */
/* Backoffice                                                                 */
/* -------------------------------------------------------------------------- */

export async function listRegistrations(
	ctx: AppContext,
	eventId: string
): Promise<RegistrationRow[]> {
	return ctx.db
		.select()
		.from(registrations)
		.where(eq(registrations.eventId, eventId))
		.orderBy(asc(registrations.createdAt));
}

export interface EventStats {
	registered: number;
	checkedIn: number;
	checkInRate: number;
}

export async function getEventStats(ctx: AppContext, eventId: string): Promise<EventStats> {
	const [row] = await ctx.db
		.select({
			registered: sql<number>`count(*)::int`,
			checkedIn: sql<number>`count(*) FILTER (WHERE ${registrations.checkedInAt} IS NOT NULL)::int`
		})
		.from(registrations)
		.where(eq(registrations.eventId, eventId));

	const registered = row?.registered ?? 0;
	const checkedIn = row?.checkedIn ?? 0;
	return {
		registered,
		checkedIn,
		checkInRate: registered === 0 ? 0 : Math.round((checkedIn / registered) * 100)
	};
}

/** How one answer reads in a spreadsheet cell. */
export function answerToText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.join('; ');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	return String(value);
}

/**
 * RFC 4180 CSV. Values are quoted and embedded quotes doubled.
 *
 * One column per question on the form *as it stands now*, plus the ticket
 * columns. Answers to questions that have since been deleted are not silently
 * dropped — they are collected into a trailing `other_answers` column, because
 * an organiser who removed a question after the event still collected those
 * replies and deleting their only copy on export would be a quiet data loss.
 */
export function registrationsToCsv(
	rows: readonly RegistrationRow[],
	// Required, not defaulted: a caller that forgets it would silently export a
	// file with no answer columns at all, which looks like data loss.
	form: FormDefinition
): string {
	const questions: QuestionBlock[] = form.filter(isQuestion);
	const known = new Set(questions.map((q) => q.id));

	const header = [
		...questions.map((q) => q.label),
		'ticket_code',
		'checked_in_at',
		'registered_at',
		'other_answers'
	];

	const escape = (value: string | null): string => `"${(value ?? '').replace(/"/g, '""')}"`;

	const lines = rows.map((r) => {
		const answers = (r.answers ?? {}) as Answers;

		const extras = Object.entries(answers)
			.filter(([id, value]) => !known.has(id) && value !== null && value !== undefined)
			.map(([id, value]) => `${id}: ${answerToText(value)}`)
			.join(' | ');

		return [
			...questions.map((q) => escape(answerToText(answers[q.id]))),
			escape(r.ticketCode),
			escape(r.checkedInAt ? r.checkedInAt.toISOString() : null),
			escape(r.createdAt.toISOString()),
			escape(extras)
		].join(',');
	});

	return [header.map(escape).join(','), ...lines].join('\r\n');
}

export async function countCheckedIn(ctx: AppContext, eventId: string): Promise<number> {
	const [row] = await ctx.db
		.select({ count: sql<number>`count(*)::int` })
		.from(registrations)
		.where(and(eq(registrations.eventId, eventId), isNotNull(registrations.checkedInAt)));
	return row?.count ?? 0;
}
