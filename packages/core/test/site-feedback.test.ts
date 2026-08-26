import { siteFeedback, users } from '@awsug/db';
import { describe, expect, it } from 'vitest';
import * as eventService from '../src/services/events.js';
import * as siteFeedbackService from '../src/services/site-feedback.js';
import { futureEvent, getTestDb, makeContext } from './helpers.js';

/** A reviewer to attribute moderation decisions to. */
async function seedReviewer(): Promise<string> {
	const db = await getTestDb();
	const [user] = await db
		.insert(users)
		.values({ email: 'organiser@example.la', name: 'Organiser', role: 'admin' })
		.returning();
	if (!user) throw new Error('Failed to seed reviewer');
	return user.id;
}

describe('site feedback', () => {
	it('lands as pending, whatever the caller asks for', async () => {
		const ctx = await makeContext();

		const created = await siteFeedbackService.submitSiteFeedback(
			ctx,
			{ message: 'The venue was easy to find, thank you.' },
			'lo'
		);

		expect(created.status).toBe('pending');
		expect(created.reviewedAt).toBeNull();
	});

	/** The property the whole feature rests on: nothing is public by default. */
	it('keeps a pending message off the public list', async () => {
		const ctx = await makeContext();

		await siteFeedbackService.submitSiteFeedback(ctx, { message: 'Not approved yet.' }, 'lo');

		expect(await siteFeedbackService.listApprovedFeedback(ctx)).toHaveLength(0);
	});

	it('publishes on approval and records who decided', async () => {
		const ctx = await makeContext();
		const reviewerId = await seedReviewer();

		const created = await siteFeedbackService.submitSiteFeedback(
			ctx,
			{ message: 'Please run the workshop again.', rating: 5 },
			'en'
		);

		await siteFeedbackService.setSiteFeedbackStatus(ctx, created.id, 'approved', reviewerId);

		const published = await siteFeedbackService.listApprovedFeedback(ctx);
		expect(published).toHaveLength(1);
		expect(published[0]?.message).toBe('Please run the workshop again.');
		expect(published[0]?.rating).toBe(5);

		const [row] = await ctx.db.select().from(siteFeedback);
		expect(row?.reviewedBy).toBe(reviewerId);
		expect(row?.reviewedAt).toBeInstanceOf(Date);
	});

	it('archiving takes a published message off the site without destroying it', async () => {
		const ctx = await makeContext();
		const reviewerId = await seedReviewer();

		const created = await siteFeedbackService.submitSiteFeedback(
			ctx,
			{ message: 'Hello there.' },
			'lo'
		);
		await siteFeedbackService.setSiteFeedbackStatus(ctx, created.id, 'approved', reviewerId);
		expect(await siteFeedbackService.listApprovedFeedback(ctx)).toHaveLength(1);

		await siteFeedbackService.setSiteFeedbackStatus(ctx, created.id, 'archived', reviewerId);
		expect(await siteFeedbackService.listApprovedFeedback(ctx)).toHaveLength(0);
		expect(await siteFeedbackService.listSiteFeedback(ctx, 'archived')).toHaveLength(1);
	});

	it('counts only what is waiting for a decision', async () => {
		const ctx = await makeContext();
		const reviewerId = await seedReviewer();

		const first = await siteFeedbackService.submitSiteFeedback(ctx, { message: 'One.' }, 'lo');
		await siteFeedbackService.submitSiteFeedback(ctx, { message: 'Two.' }, 'lo');

		expect(await siteFeedbackService.countPendingFeedback(ctx)).toBe(2);

		await siteFeedbackService.setSiteFeedbackStatus(ctx, first.id, 'approved', reviewerId);
		expect(await siteFeedbackService.countPendingFeedback(ctx)).toBe(1);
	});

	it('can be attached to an event', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		const created = await siteFeedbackService.submitSiteFeedback(
			ctx,
			{ message: 'Great meetup.', eventId: event.id },
			'lo'
		);

		expect(created.eventId).toBe(event.id);
	});

	it('never publishes the sender address', async () => {
		const ctx = await makeContext();
		const reviewerId = await seedReviewer();

		const created = await siteFeedbackService.submitSiteFeedback(
			ctx,
			{ message: 'Reply to me please.', email: 'visitor@example.la' },
			'lo'
		);
		await siteFeedbackService.setSiteFeedbackStatus(ctx, created.id, 'approved', reviewerId);

		const published = await siteFeedbackService.listApprovedFeedback(ctx);
		expect(published[0]).not.toHaveProperty('email');

		// It is still there for an organiser to reply to.
		const queue = await siteFeedbackService.listSiteFeedback(ctx, 'approved');
		expect(queue[0]?.email).toBe('visitor@example.la');
	});
});
