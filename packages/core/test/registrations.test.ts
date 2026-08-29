import { events, registrations, users } from '@awsug/db';
import {
	AlreadyCheckedInError,
	AlreadyRegisteredError,
	EventFullError,
	NotFoundError,
	RegistrationClosedError,
	RegistrationNotApprovedError
} from '@awsug/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as eventService from '../src/services/events.js';
import * as registrationService from '../src/services/registrations.js';
import { futureEvent, getTestDb, makeContext } from './helpers.js';

/**
 * A submission to the default form. `fullName` and `email` are the block ids
 * DEFAULT_FORM_BLOCKS uses, and the two questions tagged with the name and
 * email roles — which is what makes them land in the mirrored columns.
 */
function attendee(i: number) {
	return { answers: { fullName: `Attendee ${i}`, email: `attendee${i}@example.la` } };
}

describe('registerForEvent', () => {
	it('records a registration and sends a confirmation', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));

		const { registration, ticketUrl } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);

		expect(registration.ticketCode).toHaveLength(26);
		expect(ticketUrl).toContain(registration.ticketCode);
		expect(ctx.email.sent).toHaveLength(1);
		expect(ctx.email.sent[0]?.to).toBe('attendee1@example.la');
		expect(ctx.email.sent[0]?.subject).toContain('Test Event');
	});

	/**
	 * The reason `registeredCount` exists and is claimed with a conditional
	 * UPDATE. If this ever regresses to a read-then-write, this test oversells.
	 */
	it('never oversells capacity under concurrent registrations', async () => {
		const ctx = await makeContext();
		const capacity = 5;
		const attempts = 25;
		const event = await eventService.createEvent(ctx, futureEvent({ capacity }));

		const results = await Promise.allSettled(
			Array.from({ length: attempts }, (_, i) =>
				registrationService.registerForEvent(ctx, 'test-event', attendee(i), 'en')
			)
		);

		const succeeded = results.filter((r) => r.status === 'fulfilled');
		const failed = results.filter((r) => r.status === 'rejected');

		expect(succeeded).toHaveLength(capacity);
		expect(failed).toHaveLength(attempts - capacity);
		for (const failure of failed) {
			expect(failure.reason).toBeInstanceOf(EventFullError);
		}

		const db = await getTestDb();
		const [row] = await db.select().from(events).where(eq(events.id, event.id));
		expect(row?.registeredCount).toBe(capacity);

		const stored = await db.select().from(registrations).where(eq(registrations.eventId, event.id));
		expect(stored).toHaveLength(capacity);
		expect(ctx.email.sent).toHaveLength(capacity);
	});

	it('rejects a duplicate email without consuming a seat', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));

		await registrationService.registerForEvent(ctx, 'test-event', attendee(1), 'en');
		await expect(
			registrationService.registerForEvent(ctx, 'test-event', attendee(1), 'en')
		).rejects.toBeInstanceOf(AlreadyRegisteredError);

		// The rolled-back transaction must have released the seat it claimed.
		const db = await getTestDb();
		const [row] = await db.select().from(events).where(eq(events.id, event.id));
		expect(row?.registeredCount).toBe(1);
	});

	it('treats differently-cased emails as the same person', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));

		await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { fullName: 'A', email: 'someone@example.la' } },
			'en'
		);
		await expect(
			registrationService.registerForEvent(
				ctx,
				'test-event',
				{ answers: { fullName: 'A', email: 'SOMEONE@example.la' } },
				'en'
			)
		).rejects.toBeInstanceOf(AlreadyRegisteredError);
	});

	it('allows unlimited registrations when capacity is 0', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 0 }));

		const results = await Promise.allSettled(
			Array.from({ length: 12 }, (_, i) =>
				registrationService.registerForEvent(ctx, 'test-event', attendee(i), 'en')
			)
		);

		expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
	});

	it('refuses registration once the event has started', async () => {
		const ctx = await makeContext();
		const start = new Date(Date.now() - 3_600_000);
		await eventService.createEvent(
			ctx,
			futureEvent({
				capacity: 10,
				startAt: start,
				endAt: new Date(start.getTime() + 7_200_000)
			})
		);

		await expect(
			registrationService.registerForEvent(ctx, 'test-event', attendee(1), 'en')
		).rejects.toBeInstanceOf(RegistrationClosedError);
	});

	it('refuses registration for a draft event', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, status: 'draft' }));

		await expect(
			registrationService.registerForEvent(ctx, 'test-event', attendee(1), 'en')
		).rejects.toBeInstanceOf(RegistrationClosedError);
	});

	it('sends the confirmation in the requested locale', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));

		await registrationService.registerForEvent(ctx, 'test-event', attendee(1), 'lo');
		expect(ctx.email.sent[0]?.subject).toContain('ຢືນຢັນການລົງທະບຽນ');
		expect(ctx.email.sent[0]?.subject).toContain('ງານທົດສອບ');
	});
});

describe('checkIn', () => {
	it('checks a ticket in exactly once', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);

		const result = await registrationService.checkIn(ctx, {
			ticketCode: registration.ticketCode
		});
		expect(result.registration.checkedInAt).toBeInstanceOf(Date);

		await expect(
			registrationService.checkIn(ctx, { ticketCode: registration.ticketCode })
		).rejects.toBeInstanceOf(AlreadyCheckedInError);
	});

	it('rejects an unknown ticket code', async () => {
		const ctx = await makeContext();
		await expect(registrationService.checkIn(ctx, { ticketCode: 'NOPE' })).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('records only one check-in when two scanners race the same ticket', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);

		const results = await Promise.allSettled([
			registrationService.checkIn(ctx, { ticketCode: registration.ticketCode }),
			registrationService.checkIn(ctx, { ticketCode: registration.ticketCode })
		]);

		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
	});
});

describe('stats and export', () => {
	it('reports the check-in rate', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));

		const created = [];
		for (let i = 0; i < 4; i++) {
			created.push(
				await registrationService.registerForEvent(ctx, 'test-event', attendee(i), 'en')
			);
		}
		await registrationService.checkIn(ctx, {
			ticketCode: created[0]!.registration.ticketCode
		});

		const stats = await registrationService.getEventStats(ctx, event.id);
		expect(stats).toEqual({
			registered: 4,
			pending: 0,
			rejected: 0,
			checkedIn: 1,
			checkInRate: 25
		});
	});

	it('escapes quotes and commas in the CSV export', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { fullName: 'Bounmy "Boun", Jr.', email: 'boun@example.la' } },
			'en'
		);

		const rows = await registrationService.listRegistrations(ctx, event.id);
		const csv = registrationService.registrationsToCsv(rows, event.formSchema);

		// The columns are the form's questions, by label, not a fixed list.
		expect(csv.split('\r\n')[0]).toBe(
			'"Full name","Email address","Phone","Organisation","ticket_code","status","checked_in_at","registered_at","other_answers"'
		);
		expect(csv).toContain('"Bounmy ""Boun"", Jr."');
	});
});

describe('approval mode', () => {
	/** The organiser row every decision is attributed to. */
	async function makeReviewer() {
		const db = await getTestDb();
		const [user] = await db
			.insert(users)
			.values({ email: 'organiser@awsug.la', name: 'Organiser', role: 'admin' })
			.returning();
		if (!user) throw new Error('reviewer insert returned no row');
		return user.id;
	}

	async function eventId(slug = 'test-event') {
		const db = await getTestDb();
		const [row] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
		if (!row) throw new Error('event not found');
		return row;
	}

	it('leaves a normal event completely unchanged', async () => {
		// The regression guard: every event that never opts in must behave
		// exactly as it did before approval existed.
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));

		const { registration, status } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);

		expect(status).toBe('approved');
		expect(registration.status).toBe('approved');
		expect((await eventId()).registeredCount).toBe(1);
		expect(ctx.email.sent).toHaveLength(1);
		expect(ctx.email.sent[0]?.subject).toContain('Registration confirmed');
	});

	it('holds no seat while pending, and sends the received email', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));

		const { registration, status } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);

		expect(status).toBe('pending');
		expect(registration.status).toBe('pending');
		// The whole point: an application is not an attendee.
		expect((await eventId()).registeredCount).toBe(0);
		expect(ctx.email.sent).toHaveLength(1);
		expect(ctx.email.sent[0]?.subject).toContain('We have your registration');
		// No ticket code in a message for somebody who has no place yet.
		expect(ctx.email.sent[0]?.html).not.toContain(registration.ticketCode);
	});

	it('claims the seat on approval and sends the ticket', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));
		const reviewer = await makeReviewer();
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);
		const event = await eventId();

		const result = await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [registration.id], decision: 'approved' },
			reviewer
		);

		expect(result.approved).toBe(1);
		expect((await eventId()).registeredCount).toBe(1);
		expect(ctx.email.sent).toHaveLength(2);
		expect(ctx.email.sent[1]?.subject).toContain('Registration confirmed');
		expect(ctx.email.sent[1]?.html).toContain('cid:ticket-qr');
	});

	it('releases the seat when an approved registration is rejected', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));
		const reviewer = await makeReviewer();
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);
		const event = await eventId();

		await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [registration.id], decision: 'approved' },
			reviewer
		);
		expect((await eventId()).registeredCount).toBe(1);

		await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [registration.id], decision: 'rejected', note: 'Oversubscribed' },
			reviewer
		);

		expect((await eventId()).registeredCount).toBe(0);
		const [row] = await (
			await getTestDb()
		)
			.select()
			.from(registrations)
			.where(eq(registrations.id, registration.id));
		expect(row?.status).toBe('rejected');
		expect(row?.reviewNote).toBe('Oversubscribed');
		expect(row?.reviewedBy).toBe(reviewer);
	});

	it('carries the organiser note into the rejection email, and reads without one', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));
		const reviewer = await makeReviewer();
		const a = await registrationService.registerForEvent(ctx, 'test-event', attendee(1), 'en');
		const b = await registrationService.registerForEvent(ctx, 'test-event', attendee(2), 'en');
		const event = await eventId();

		await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [a.registration.id], decision: 'rejected', note: 'Oversubscribed this time' },
			reviewer
		);
		await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [b.registration.id], decision: 'rejected' },
			reviewer
		);

		const withNote = ctx.email.sent.at(-2);
		const without = ctx.email.sent.at(-1);
		expect(withNote?.text).toContain('Oversubscribed this time');
		// The neutral message has to stand on its own — the note is an addition.
		expect(without?.text).toContain('not able to offer you a place');
		expect(without?.text).not.toContain('undefined');
	});

	it('stops at capacity instead of overselling, and says which got through', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 2, requiresApproval: true }));
		const reviewer = await makeReviewer();

		const ids: string[] = [];
		for (let i = 1; i <= 4; i += 1) {
			const { registration } = await registrationService.registerForEvent(
				ctx,
				'test-event',
				attendee(i),
				'en'
			);
			ids.push(registration.id);
		}
		const event = await eventId();

		const result = await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids, decision: 'approved' },
			reviewer
		);

		expect(result.approved).toBe(2);
		expect(result.skipped).toBe(2);
		expect(result.outcomes.filter((o) => o.skipped === 'event_full')).toHaveLength(2);
		expect((await eventId()).registeredCount).toBe(2);
	});

	it('does not rewrite a decision that is already recorded', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));
		const reviewer = await makeReviewer();
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);
		const event = await eventId();

		await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [registration.id], decision: 'approved' },
			reviewer
		);
		const again = await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [registration.id], decision: 'approved' },
			reviewer
		);

		expect(again.skipped).toBe(1);
		expect(again.outcomes[0]?.skipped).toBe('unchanged');
		// Not double-counted, and no second copy of the ticket email.
		expect((await eventId()).registeredCount).toBe(1);
		expect(ctx.email.sent).toHaveLength(2);
	});

	it('refuses check-in for a registration that is not approved', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);

		await expect(
			registrationService.checkIn(ctx, { ticketCode: registration.ticketCode })
		).rejects.toBeInstanceOf(RegistrationNotApprovedError);
	});

	it('writes the decision email in the language the person registered in', async () => {
		// The reason the locale is stored on the row: approval happens days later,
		// from a backoffice that has no visitor locale in scope.
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));
		const reviewer = await makeReviewer();
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'lo'
		);
		const event = await eventId();

		await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [registration.id], decision: 'approved' },
			reviewer
		);

		expect(ctx.email.sent.at(-1)?.subject).toContain('ຢືນຢັນການລົງທະບຽນ');
	});

	it('recounts approved registrations only', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10, requiresApproval: true }));
		const reviewer = await makeReviewer();
		const a = await registrationService.registerForEvent(ctx, 'test-event', attendee(1), 'en');
		await registrationService.registerForEvent(ctx, 'test-event', attendee(2), 'en');
		const event = await eventId();

		await registrationService.reviewRegistrations(
			ctx,
			event.id,
			{ ids: [a.registration.id], decision: 'approved' },
			reviewer
		);

		// The repair tool must agree with what claims a seat, or running it
		// silently re-inflates the counter with the pending queue.
		expect(await eventService.recountRegistrations(ctx, event.id)).toBe(1);
	});

	it('keeps existing registrations approved when approval is switched on', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			attendee(1),
			'en'
		);
		const event = await eventId();

		await (
			await getTestDb()
		)
			.update(events)
			.set({ requiresApproval: true })
			.where(eq(events.id, event.id));

		const [row] = await (
			await getTestDb()
		)
			.select()
			.from(registrations)
			.where(eq(registrations.id, registration.id));

		// Nobody already holding a ticket loses it to a toggle.
		expect(row?.status).toBe('approved');
		expect((await eventId()).registeredCount).toBe(1);
	});
});
