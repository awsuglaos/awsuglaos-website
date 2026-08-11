import { events, registrations } from '@awsug/db';
import {
	AlreadyCheckedInError,
	AlreadyRegisteredError,
	EventFullError,
	NotFoundError,
	RegistrationClosedError
} from '@awsug/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as eventService from '../src/services/events.js';
import * as registrationService from '../src/services/registrations.js';
import { futureEvent, getTestDb, makeContext } from './helpers.js';

function attendee(i: number) {
	return { fullName: `Attendee ${i}`, email: `attendee${i}@example.la` };
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
			{ fullName: 'A', email: 'someone@example.la' },
			'en'
		);
		await expect(
			registrationService.registerForEvent(
				ctx,
				'test-event',
				{ fullName: 'A', email: 'SOMEONE@example.la' },
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
		await expect(
			registrationService.checkIn(ctx, { ticketCode: 'NOPE' })
		).rejects.toBeInstanceOf(NotFoundError);
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
		expect(stats).toEqual({ registered: 4, checkedIn: 1, checkInRate: 25 });
	});

	it('escapes quotes and commas in the CSV export', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ fullName: 'Bounmy "Boun", Jr.', email: 'boun@example.la' },
			'en'
		);

		const rows = await registrationService.listRegistrations(ctx, event.id);
		const csv = registrationService.registrationsToCsv(rows);

		expect(csv.split('\r\n')[0]).toBe(
			'full_name,email,phone,organisation,ticket_code,checked_in_at,registered_at'
		);
		expect(csv).toContain('"Bounmy ""Boun"", Jr."');
	});
});
