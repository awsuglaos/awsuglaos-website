import { events, registrations, type Event, type RegistrationRow } from '@awsug/db';
import {
	AlreadyCheckedInError,
	AlreadyRegisteredError,
	EventFullError,
	NotFoundError,
	RegistrationClosedError,
	generateTicketCode,
	type CheckInInput,
	type Locale,
	type RegistrationInput
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

/**
 * Claims a seat and records the registration.
 *
 * The seat is claimed by a single conditional UPDATE rather than a read-then-
 * write. Under concurrent requests Postgres serialises the row update, and each
 * waiting statement re-evaluates its WHERE clause against the newly committed
 * row — so the capacity test cannot be passed by two callers at once. Wrapping
 * it with the INSERT means a duplicate-email rejection rolls the claimed seat
 * back automatically, with no compensating write to get wrong.
 */
export async function registerForEvent(
	ctx: AppContext,
	eventSlug: string,
	input: RegistrationInput,
	locale: Locale
): Promise<RegistrationResult> {
	const now = currentTime(ctx);

	const event = await ctx.db.query.events.findFirst({
		where: eq(events.slug, eventSlug),
		with: { translations: true }
	});
	if (!event) throw new NotFoundError('Event');

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
			const [current] = await tx
				.select()
				.from(events)
				.where(eq(events.id, event.id))
				.limit(1);
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
					fullName: input.fullName,
					email: input.email,
					phone: input.phone ?? null,
					organisation: input.organisation || null,
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

	// Sent after the transaction commits: a mail failure must not undo a valid
	// registration, and SES latency should not hold a database transaction open.
	try {
		const template = registrationConfirmationEmail({
			locale,
			fullName: registration.fullName,
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

/** RFC 4180 CSV. Values are quoted and embedded quotes doubled. */
export function registrationsToCsv(rows: readonly RegistrationRow[]): string {
	const header = [
		'full_name',
		'email',
		'phone',
		'organisation',
		'ticket_code',
		'checked_in_at',
		'registered_at'
	];

	const escape = (value: string | null): string => `"${(value ?? '').replace(/"/g, '""')}"`;

	const lines = rows.map((r) =>
		[
			escape(r.fullName),
			escape(r.email),
			escape(r.phone),
			escape(r.organisation),
			escape(r.ticketCode),
			escape(r.checkedInAt ? r.checkedInAt.toISOString() : null),
			escape(r.createdAt.toISOString())
		].join(',')
	);

	return [header.join(','), ...lines].join('\r\n');
}

export async function countCheckedIn(ctx: AppContext, eventId: string): Promise<number> {
	const [row] = await ctx.db
		.select({ count: sql<number>`count(*)::int` })
		.from(registrations)
		.where(and(eq(registrations.eventId, eventId), isNotNull(registrations.checkedInAt)));
	return row?.count ?? 0;
}
