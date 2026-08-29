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
	RegistrationNotApprovedError,
	ValidationFailedError,
	generateTicketCode,
	type Answers,
	type CheckInInput,
	type FormDefinition,
	type Locale,
	type QuestionBlock,
	type RegistrationStatus,
	type ReviewRegistrationsInput
} from '@awsug/shared';
import { and, asc, eq, gt, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';
import { renderTicketQr } from '../email/qr.js';
import {
	registrationConfirmationEmail,
	registrationDeclinedEmail,
	registrationReceivedEmail
} from '../email/templates.js';
import { isUniqueViolation } from '../util/db-errors.js';
import { pickTranslation } from '../util/translation.js';
import { deriveRegistrationState, type EventWithTranslations } from './events.js';

export interface RegistrationResult {
	registration: RegistrationRow;
	/**
	 * Live from the moment of registration, but it only shows a scannable ticket
	 * once the registration is approved — the page branches on status, so a
	 * pending applicant who opens this sees where they stand instead of a QR.
	 */
	ticketUrl: string;
	/** `pending` on an approval event; `approved` everywhere else. */
	status: RegistrationStatus;
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

	/*
	 * On an approval event the seat is not claimed here — it is claimed when an
	 * organiser approves, so `registeredCount` always means "people who are
	 * actually coming" and the public "spots left" figure stays truthful.
	 *
	 * The gate below still runs either way, and with the same WHERE clause: a
	 * closed, unpublished or full event must refuse a pending application just
	 * as it refuses a booking. Only the increment differs, so both paths keep
	 * the identical atomicity and the identical "re-read to say why" reporting.
	 */
	const seatDelta = event.requiresApproval ? 0 : 1;

	const registration = await ctx.db.transaction(async (tx) => {
		const claimed = await tx
			.update(events)
			.set({
				registeredCount: sql`${events.registeredCount} + ${seatDelta}`,
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
					ticketCode: generateTicketCode(),
					locale,
					// The column defaults to `approved`, which is what keeps every
					// pre-existing row and every non-approval event untouched.
					status: event.requiresApproval ? 'pending' : 'approved'
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

	/*
	 * No email question on this form means no address to send to, and that is a
	 * legitimate configuration rather than a failure — the ticket still exists
	 * and its URL is shown on the confirmation page. The builder warns the
	 * organiser at the point they remove the question.
	 *
	 * Sent after the transaction commits: a mail failure must not undo a valid
	 * registration, and provider latency should not hold a transaction open.
	 */
	await sendRegistrationEmail(ctx, registration, event, locale);

	return { registration, ticketUrl, status: registration.status };
}

/* -------------------------------------------------------------------------- */
/* Outgoing mail                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The one place a registration turns into a message.
 *
 * Which template goes out follows the row's status, so registering on a normal
 * event and being approved on an approval event produce the identical ticket
 * email — there is no second copy of that markup to drift.
 *
 * Every failure in here is logged and swallowed. This is called after the
 * transaction that matters has already committed, and a mail outage must never
 * be the reason a valid registration or a recorded decision is lost.
 */
async function sendRegistrationEmail(
	ctx: AppContext,
	registration: RegistrationRow,
	event: EventWithTranslations,
	locale: Locale
): Promise<void> {
	if (!registration.email) return;

	const translation = pickTranslation(event.translations, locale);
	const shared = {
		locale,
		siteUrl: ctx.siteUrl,
		fullName: registration.fullName ?? registration.ticketCode,
		eventTitle: translation?.title ?? event.slug,
		startAt: event.startAt,
		locationName: translation?.locationName ?? '',
		coverImageUrl: event.coverImageUrl
	};

	try {
		let template;

		if (registration.status === 'pending') {
			template = registrationReceivedEmail(shared);
		} else if (registration.status === 'rejected') {
			template = registrationDeclinedEmail({ ...shared, note: registration.reviewNote });
		} else {
			/*
			 * The QR is embedded so an attendee with no signal at the door still
			 * has it. Encoding it must never be the reason a confirmation goes
			 * unsent, so a failure here drops the panel and leaves the message
			 * with its ticket link — which is all it carried before.
			 */
			const qr = await renderTicketQr(registration.ticketCode).catch((error: unknown) => {
				console.error('Ticket QR render failed', {
					registrationId: registration.id,
					error: error instanceof Error ? error.message : String(error)
				});
				return undefined;
			});

			template = registrationConfirmationEmail({
				...shared,
				ticketCode: registration.ticketCode,
				ticketUrl: buildTicketUrl(ctx.siteUrl, event.slug, registration.ticketCode),
				...(translation?.description ? { description: translation.description } : {}),
				...(qr ? { qr } : {})
			});
		}

		await ctx.email.send({ to: registration.email, ...template });
	} catch (error) {
		console.error('Registration email failed', {
			registrationId: registration.id,
			status: registration.status,
			error: error instanceof Error ? error.message : String(error)
		});
	}
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
	/*
	 * Ticket codes are minted at registration, before anyone has decided
	 * anything, so on an approval event a pending applicant is walking around
	 * with a real code. Checked before the already-checked-in test so the
	 * scanner is told the actual reason.
	 */
	if (existing.status !== 'approved') throw new RegistrationNotApprovedError(existing.status);
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

/* -------------------------------------------------------------------------- */
/* Approval queue                                                             */
/* -------------------------------------------------------------------------- */

export interface ReviewOutcome {
	id: string;
	/** Where the row ended up. Unchanged when `skipped` is set. */
	status: RegistrationStatus;
	/** Set when the decision could not be applied, and why. */
	skipped?: 'event_full' | 'unchanged';
}

export interface ReviewResult {
	outcomes: ReviewOutcome[];
	approved: number;
	rejected: number;
	skipped: number;
}

/**
 * Approve or reject registrations, moving their seats with them.
 *
 * The seat follows the status, not the row: `registeredCount` counts approved
 * registrations, so `pending -> approved` claims one, `approved -> rejected`
 * releases one, and the two transitions that start and end outside `approved`
 * move nothing.
 *
 * A seat is claimed with the same conditional UPDATE the registration path uses
 * — capacity re-tested inside the statement — so approving a queue that does
 * not fit stops at the capacity line instead of overselling the room. That is
 * reported per row rather than thrown: approving forty people and being told
 * only "event full", with no way to know which of them got in, would be worse
 * than useless.
 *
 * Mail goes out after the transaction commits, for the same reason it does on
 * registration: a provider outage must not roll back a recorded decision.
 */
export async function reviewRegistrations(
	ctx: AppContext,
	eventId: string,
	input: ReviewRegistrationsInput,
	reviewerId: string
): Promise<ReviewResult> {
	const now = currentTime(ctx);
	const decision = input.decision;

	const event = await ctx.db.query.events.findFirst({
		where: eq(events.id, eventId),
		with: { translations: true }
	});
	if (!event) throw new NotFoundError('Event');

	const rows = await ctx.db
		.select()
		.from(registrations)
		.where(and(eq(registrations.eventId, eventId), inArray(registrations.id, input.ids)));

	const outcomes: ReviewOutcome[] = [];
	const decided: RegistrationRow[] = [];

	await ctx.db.transaction(async (tx) => {
		for (const row of rows) {
			if (row.status === decision) {
				// Already there. Recording it again would rewrite the reviewer and
				// timestamp of a decision somebody else made.
				outcomes.push({ id: row.id, status: row.status, skipped: 'unchanged' });
				continue;
			}

			const seatDelta = decision === 'approved' ? 1 : row.status === 'approved' ? -1 : 0;

			if (seatDelta > 0) {
				const claimed = await tx
					.update(events)
					.set({ registeredCount: sql`${events.registeredCount} + 1`, updatedAt: now })
					.where(
						and(
							eq(events.id, eventId),
							or(eq(events.capacity, 0), sql`${events.registeredCount} < ${events.capacity}`)
						)
					)
					.returning({ id: events.id });

				if (claimed.length === 0) {
					outcomes.push({ id: row.id, status: row.status, skipped: 'event_full' });
					continue;
				}
			} else if (seatDelta < 0) {
				// GREATEST guards the floor: a counter that has drifted below zero
				// must not be driven further negative by a rejection.
				await tx
					.update(events)
					.set({
						registeredCount: sql`GREATEST(${events.registeredCount} - 1, 0)`,
						updatedAt: now
					})
					.where(eq(events.id, eventId));
			}

			const [updated] = await tx
				.update(registrations)
				.set({
					status: decision,
					reviewedBy: reviewerId,
					reviewedAt: now,
					// Only ever meaningful on a rejection, and cleared on approval so a
					// note from an earlier decision cannot linger on the row.
					reviewNote: decision === 'rejected' ? (input.note ?? null) : null
				})
				.where(eq(registrations.id, row.id))
				.returning();

			if (!updated) throw new Error('Registration update returned no row');

			outcomes.push({ id: updated.id, status: updated.status });
			decided.push(updated);
		}
	});

	for (const registration of decided) {
		// Each in the registrant's own language, which is why it is stored.
		await sendRegistrationEmail(
			ctx,
			registration,
			event as EventWithTranslations,
			registration.locale
		);
	}

	return {
		outcomes,
		approved: outcomes.filter((o) => !o.skipped && o.status === 'approved').length,
		rejected: outcomes.filter((o) => !o.skipped && o.status === 'rejected').length,
		skipped: outcomes.filter((o) => o.skipped).length
	};
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
	eventId: string,
	status?: RegistrationStatus
): Promise<RegistrationRow[]> {
	return ctx.db
		.select()
		.from(registrations)
		.where(
			status
				? and(eq(registrations.eventId, eventId), eq(registrations.status, status))
				: eq(registrations.eventId, eventId)
		)
		.orderBy(asc(registrations.createdAt));
}

export interface EventStats {
	/** Approved registrations — the people who actually have a place. */
	registered: number;
	pending: number;
	rejected: number;
	checkedIn: number;
	checkInRate: number;
}

export async function getEventStats(ctx: AppContext, eventId: string): Promise<EventStats> {
	/*
	 * `registered` counts approved rows only, so the tile and the check-in rate
	 * both mean "of the people who have a place". Counting a queue of pending
	 * applications in the denominator would drag the rate down for a reason that
	 * has nothing to do with who turned up.
	 */
	const [row] = await ctx.db
		.select({
			registered: sql<number>`count(*) FILTER (WHERE ${registrations.status} = 'approved')::int`,
			pending: sql<number>`count(*) FILTER (WHERE ${registrations.status} = 'pending')::int`,
			rejected: sql<number>`count(*) FILTER (WHERE ${registrations.status} = 'rejected')::int`,
			checkedIn: sql<number>`count(*) FILTER (WHERE ${registrations.checkedInAt} IS NOT NULL)::int`
		})
		.from(registrations)
		.where(eq(registrations.eventId, eventId));

	const registered = row?.registered ?? 0;
	const checkedIn = row?.checkedIn ?? 0;
	return {
		registered,
		pending: row?.pending ?? 0,
		rejected: row?.rejected ?? 0,
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
		'status',
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
			escape(r.status),
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
