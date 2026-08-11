import { SlugTakenError } from '@awsug/shared';
import { describe, expect, it } from 'vitest';
import * as articleService from '../src/services/articles.js';
import * as eventService from '../src/services/events.js';
import * as newsletterService from '../src/services/newsletter.js';
import * as sponsorService from '../src/services/sponsors.js';
import { futureEvent, makeContext } from './helpers.js';

function article(overrides: Record<string, unknown> = {}) {
	return {
		slug: 'test-article',
		coverImageUrl: '',
		category: 'Community',
		status: 'draft' as const,
		translations: [
			{ locale: 'lo' as const, title: 'ຫົວຂໍ້ທົດສອບ', excerpt: 'ຫຍໍ້', content: 'ເນື້ອໃນ' },
			{ locale: 'en' as const, title: 'Test title', excerpt: 'Summary', content: 'Body' }
		],
		...overrides
	};
}

describe('events', () => {
	it('derives registration state from dates, status and seats', async () => {
		const ctx = await makeContext();
		const open = await eventService.createEvent(ctx, futureEvent({ capacity: 10 }));
		expect(eventService.deriveRegistrationState(open, new Date())).toBe('open');

		const draft = { ...open, status: 'draft' as const };
		expect(eventService.deriveRegistrationState(draft, new Date())).toBe('unpublished');

		const full = { ...open, registeredCount: 10 };
		expect(eventService.deriveRegistrationState(full, new Date())).toBe('full');

		const started = { ...open, startAt: new Date(Date.now() - 1000) };
		expect(eventService.deriveRegistrationState(started, new Date())).toBe('closed');
	});

	it('falls back to the base locale when a translation is missing', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(
			ctx,
			futureEvent({
				translations: [
					{
						locale: 'lo' as const,
						title: 'ມີແຕ່ພາສາລາວ',
						description: 'ລາຍລະອຽດ',
						locationName: 'ວຽງຈັນ'
					}
				]
			})
		);

		const view = await eventService.getPublishedEventBySlug(ctx, 'test-event', 'en');
		expect(view.title).toBe('ມີແຕ່ພາສາລາວ');
		expect(view.translationFallback).toBe(true);
	});

	it('splits upcoming and past events', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ slug: 'upcoming' }));
		const past = new Date(Date.now() - 10 * 86_400_000);
		await eventService.createEvent(
			ctx,
			futureEvent({
				slug: 'past',
				startAt: past,
				endAt: new Date(past.getTime() + 3_600_000)
			})
		);

		const upcoming = await eventService.listPublishedEvents(ctx, {
			locale: 'en',
			when: 'upcoming'
		});
		const previous = await eventService.listPublishedEvents(ctx, { locale: 'en', when: 'past' });

		expect(upcoming.map((e) => e.slug)).toEqual(['upcoming']);
		expect(previous.map((e) => e.slug)).toEqual(['past']);
	});

	it('reports remaining seats and rejects a duplicate slug', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent({ capacity: 3 }));

		const view = await eventService.getPublishedEventBySlug(ctx, 'test-event', 'en');
		expect(view.seatsRemaining).toBe(3);

		await expect(eventService.createEvent(ctx, futureEvent())).rejects.toBeInstanceOf(
			SlugTakenError
		);
	});
});

describe('articles', () => {
	it('stamps publishedAt on the draft-to-published transition and keeps it afterwards', async () => {
		const ctx = await makeContext();
		const draft = await articleService.createArticle(ctx, article(), null);
		expect(draft.publishedAt).toBeNull();

		const published = await articleService.updateArticle(ctx, draft.id, {
			...article(),
			status: 'published'
		});
		expect(published.publishedAt).toBeInstanceOf(Date);

		const edited = await articleService.updateArticle(ctx, draft.id, {
			...article(),
			status: 'published',
			translations: [
				{ locale: 'lo' as const, title: 'ແກ້ໄຂ', excerpt: '', content: 'ໃໝ່' },
				{ locale: 'en' as const, title: 'Edited', excerpt: '', content: 'New' }
			]
		});
		expect(edited.publishedAt?.getTime()).toBe(published.publishedAt?.getTime());
	});

	it('hides drafts from the public listing', async () => {
		const ctx = await makeContext();
		await articleService.createArticle(ctx, article({ slug: 'draft-one' }), null);
		await articleService.createArticle(
			ctx,
			article({ slug: 'live-one', status: 'published' }),
			null
		);

		const listed = await articleService.listPublishedArticles(ctx, { locale: 'en' });
		expect(listed.map((a) => a.slug)).toEqual(['live-one']);
	});

	it('searches the resolved translation', async () => {
		const ctx = await makeContext();
		await articleService.createArticle(
			ctx,
			article({ slug: 'serverless-post', status: 'published' }),
			null
		);

		const hit = await articleService.listPublishedArticles(ctx, {
			locale: 'en',
			search: 'test title'
		});
		const miss = await articleService.listPublishedArticles(ctx, {
			locale: 'en',
			search: 'kubernetes'
		});

		expect(hit).toHaveLength(1);
		expect(miss).toHaveLength(0);
	});
});

describe('newsletter', () => {
	it('is idempotent and reactivates a previous unsubscribe', async () => {
		const ctx = await makeContext();

		const first = await newsletterService.subscribe(ctx, { email: 'a@example.la', locale: 'lo' });
		expect(first.isNew).toBe(true);
		expect(ctx.email.sent).toHaveLength(1);

		await newsletterService.unsubscribe(ctx, first.subscription.token);

		const second = await newsletterService.subscribe(ctx, { email: 'a@example.la', locale: 'en' });
		expect(second.isNew).toBe(false);
		expect(second.subscription.unsubscribedAt).toBeNull();
		expect(second.subscription.locale).toBe('en');
		// No second welcome email for an address we already had.
		expect(ctx.email.sent).toHaveLength(1);
	});
});

describe('sponsors', () => {
	it('orders by tier rank before sort order', async () => {
		const ctx = await makeContext();
		await sponsorService.createSponsor(ctx, {
			name: 'Community One',
			logoUrl: 'https://example.la/c.png',
			tier: 'community',
			sortOrder: 0
		});
		await sponsorService.createSponsor(ctx, {
			name: 'Platinum One',
			logoUrl: 'https://example.la/p.png',
			tier: 'platinum',
			sortOrder: 9
		});

		const listed = await sponsorService.listSponsors(ctx);
		expect(listed.map((s) => s.tier)).toEqual(['platinum', 'community']);
	});
});
