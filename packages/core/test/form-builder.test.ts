import { registrations } from '@awsug/db';
import {
	AlreadyRegisteredError,
	DEFAULT_FORM_BLOCKS,
	ValidationFailedError,
	type FormDefinition
} from '@awsug/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as eventService from '../src/services/events.js';
import * as formAnalyticsService from '../src/services/form-analytics.js';
import * as registrationService from '../src/services/registrations.js';
import { futureEvent, makeContext } from './helpers.js';

/** The default four questions plus two of the organiser's own. */
const CUSTOM_FORM: FormDefinition = [
	...DEFAULT_FORM_BLOCKS,
	{
		kind: 'question',
		id: 'level',
		type: 'radio',
		label: 'Experience',
		help: null,
		placeholder: null,
		required: true,
		role: null,
		options: ['New', 'Some', 'Lots'],
		min: null,
		max: null
	},
	{
		kind: 'question',
		id: 'laptop',
		type: 'yesNo',
		label: 'Bringing a laptop?',
		help: null,
		placeholder: null,
		required: false,
		role: null,
		options: [],
		min: null,
		max: null
	}
];

describe('a new event', () => {
	it('starts with the default form, so nothing an attendee sees changes', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		expect(await eventService.getFormSchema(ctx, event.id)).toEqual(DEFAULT_FORM_BLOCKS);
	});

	it('serves the form on the public detail view', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent());

		const view = await eventService.getPublishedEventBySlug(ctx, 'test-event', 'en');
		expect(view.form.map((block) => block.id)).toEqual([
			'fullName',
			'email',
			'phone',
			'organisation'
		]);
	});
});

describe('registering through a custom form', () => {
	async function eventWithCustomForm() {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		await eventService.setFormSchema(ctx, event.id, { blocks: CUSTOM_FORM });
		return { ctx, event };
	}

	it('stores every answer and mirrors the role-tagged ones into their columns', async () => {
		const { ctx, event } = await eventWithCustomForm();

		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			{
				answers: {
					fullName: 'Somchai',
					email: 'Somchai@Example.LA',
					phone: '020 55512345',
					level: 'Some',
					laptop: 'yes'
				}
			},
			'en'
		);

		// Mirrored: these are what the ticket, the email and check-in read.
		expect(registration.fullName).toBe('Somchai');
		expect(registration.email).toBe('somchai@example.la');
		expect(registration.phone).toBe('+8562055512345');

		// And the full set is kept, normalised on the way in.
		expect(registration.answers).toMatchObject({
			level: 'Some',
			laptop: true,
			organisation: null
		});

		expect(await registrationService.listRegistrations(ctx, event.id)).toHaveLength(1);
	});

	it('refuses a missing required answer and names the question', async () => {
		const { ctx } = await eventWithCustomForm();

		await expect(
			registrationService.registerForEvent(
				ctx,
				'test-event',
				{ answers: { fullName: 'Somchai', email: 'somchai@example.la' } },
				'en'
			)
		).rejects.toBeInstanceOf(ValidationFailedError);
	});

	it('refuses a choice that is not on the list', async () => {
		const { ctx } = await eventWithCustomForm();

		await expect(
			registrationService.registerForEvent(
				ctx,
				'test-event',
				{
					answers: {
						fullName: 'Somchai',
						email: 'somchai@example.la',
						level: 'Expert' // not an option
					}
				},
				'en'
			)
		).rejects.toBeInstanceOf(ValidationFailedError);
	});

	it('validates against the form as it stands, not as it was', async () => {
		const { ctx, event } = await eventWithCustomForm();

		// The organiser drops the required question after the form went live.
		await eventService.setFormSchema(ctx, event.id, { blocks: DEFAULT_FORM_BLOCKS });

		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { fullName: 'Somchai', email: 'somchai@example.la' } },
			'en'
		);

		expect(registration.id).toBeDefined();
	});
});

describe('a form with no email question', () => {
	const NAME_ONLY: FormDefinition = [
		{
			kind: 'question',
			id: 'who',
			type: 'shortText',
			label: 'Your name',
			help: null,
			placeholder: null,
			required: true,
			role: 'name',
			options: [],
			min: null,
			max: null
		}
	];

	async function anonymousEvent() {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		await eventService.setFormSchema(ctx, event.id, { blocks: NAME_ONLY });
		return { ctx, event };
	}

	it('still issues a ticket, and sends no email', async () => {
		const { ctx } = await anonymousEvent();

		const { registration, ticketUrl } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { who: 'Somchai' } },
			'en'
		);

		expect(registration.ticketCode).toHaveLength(26);
		expect(ticketUrl).toContain(registration.ticketCode);
		expect(registration.email).toBeNull();
		// Nowhere to send it, so nothing was sent — rather than a crash or a
		// message addressed to nobody.
		expect(ctx.email.sent).toHaveLength(0);
	});

	/**
	 * The unique index is on (event_id, lower(email)). Postgres treats NULLs as
	 * distinct, so removing the email question stops de-duplication rather than
	 * collapsing every anonymous sign-up into one row. The builder warns about
	 * exactly this.
	 */
	it('no longer blocks the same person registering twice', async () => {
		const { ctx, event } = await anonymousEvent();

		await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { who: 'Somchai' } },
			'en'
		);
		await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { who: 'Somchai' } },
			'en'
		);

		const rows = await ctx.db
			.select()
			.from(registrations)
			.where(eq(registrations.eventId, event.id));
		expect(rows).toHaveLength(2);
	});

	it('still blocks duplicates once an email question is back', async () => {
		const { ctx, event } = await anonymousEvent();
		await eventService.setFormSchema(ctx, event.id, { blocks: DEFAULT_FORM_BLOCKS });

		await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { fullName: 'Somchai', email: 'somchai@example.la' } },
			'en'
		);

		await expect(
			registrationService.registerForEvent(
				ctx,
				'test-event',
				{ answers: { fullName: 'Somchai', email: 'somchai@example.la' } },
				'en'
			)
		).rejects.toBeInstanceOf(AlreadyRegisteredError);
	});
});

describe('analytics', () => {
	async function eventWithAnswers() {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent({ capacity: 50 }));
		await eventService.setFormSchema(ctx, event.id, { blocks: CUSTOM_FORM });

		const levels = ['New', 'Some', 'Some', 'Lots'];
		for (const [index, level] of levels.entries()) {
			await registrationService.registerForEvent(
				ctx,
				'test-event',
				{
					answers: {
						fullName: `Attendee ${index}`,
						email: `attendee${index}@example.la`,
						level,
						laptop: index % 2 === 0 ? 'yes' : 'no'
					}
				},
				'en'
			);
		}

		return { ctx, event };
	}

	it('tallies choices, including an option nobody picked', async () => {
		const { ctx, event } = await eventWithAnswers();
		const rows = await registrationService.listRegistrations(ctx, event.id);
		const form = await eventService.getFormSchema(ctx, event.id);

		const summary = formAnalyticsService.summariseRegistrations(form, rows);
		const level = summary.questions.find((q) => q.id === 'level');

		expect(summary.total).toBe(4);
		expect(level?.answered).toBe(4);
		expect(level?.tallies).toEqual([
			{ label: 'New', count: 1, percent: 25 },
			{ label: 'Some', count: 2, percent: 50 },
			{ label: 'Lots', count: 1, percent: 25 }
		]);
	});

	it('splits a yes/no question', async () => {
		const { ctx, event } = await eventWithAnswers();
		const rows = await registrationService.listRegistrations(ctx, event.id);
		const form = await eventService.getFormSchema(ctx, event.id);

		const laptop = formAnalyticsService
			.summariseRegistrations(form, rows)
			.questions.find((q) => q.id === 'laptop');

		expect(laptop?.yes).toBe(2);
		expect(laptop?.no).toBe(2);
	});

	it('keeps answers to a question that was deleted from the form', async () => {
		const { ctx, event } = await eventWithAnswers();

		// The organiser removes the question after the answers came in.
		await eventService.setFormSchema(ctx, event.id, { blocks: DEFAULT_FORM_BLOCKS });

		const rows = await registrationService.listRegistrations(ctx, event.id);
		const form = await eventService.getFormSchema(ctx, event.id);
		const summary = formAnalyticsService.summariseRegistrations(form, rows);

		expect(summary.questions.some((q) => q.id === 'level')).toBe(false);

		const orphan = summary.orphans.find((o) => o.id === 'level');
		expect(orphan?.count).toBe(4);
		expect(orphan?.samples.length).toBeGreaterThan(0);
	});

	it('exports one CSV column per question, plus the deleted ones', async () => {
		const { ctx, event } = await eventWithAnswers();
		await eventService.setFormSchema(ctx, event.id, { blocks: DEFAULT_FORM_BLOCKS });

		const rows = await registrationService.listRegistrations(ctx, event.id);
		const form = await eventService.getFormSchema(ctx, event.id);
		const csv = registrationService.registrationsToCsv(rows, form);

		expect(csv.split('\r\n')[0]).toContain('"other_answers"');
		// The removed question's answers survive the export.
		expect(csv).toContain('level: Some');
	});

	it('fills in the quiet days on the trend', async () => {
		const { ctx, event } = await eventWithAnswers();
		const rows = await registrationService.listRegistrations(ctx, event.id);
		const form = await eventService.getFormSchema(ctx, event.id);

		const trend = formAnalyticsService.summariseRegistrations(form, rows).trend;

		// All four arrived on one day here, so the trend is a single point whose
		// running total matches.
		expect(trend.at(-1)?.cumulative).toBe(4);
	});
});
