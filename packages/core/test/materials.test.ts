import { events } from '@awsug/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as eventService from '../src/services/events.js';
import * as materialService from '../src/services/materials.js';
import { futureEvent, getTestDb, makeContext } from './helpers.js';

/** Drags an event's dates into the past so it counts as finished. */
async function markFinished(eventId: string) {
	const db = await getTestDb();
	const start = new Date(Date.now() - 2 * 86_400_000);
	await db
		.update(events)
		.set({ startAt: start, endAt: new Date(start.getTime() + 3 * 3_600_000) })
		.where(eq(events.id, eventId));
}

const slides = {
	title: 'Serverless workshop slides',
	kind: 'slides' as const,
	url: '/uploads/2026/08/01JABCDEF.pdf',
	sizeBytes: 2_400_000,
	contentType: 'application/pdf'
};

const repo = {
	title: 'Demo repository',
	kind: 'code' as const,
	url: 'https://github.com/awsuglaos/serverless-demo',
	sizeBytes: null,
	contentType: null
};

describe('event materials visibility', () => {
	/*
	 * The whole contract of the feature. If this regresses, slides for an event
	 * that has not happened yet become public, which is the one outcome the
	 * organisers explicitly do not want.
	 */
	it('hides resources and photos until the event has ended', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		await materialService.setResources(ctx, event.id, { resources: [slides, repo] });
		await materialService.setPhotos(ctx, event.id, {
			photos: [{ url: '/uploads/2026/08/01JPHOTO.jpg', caption: null }]
		});

		// Stored, and visible to the backoffice...
		expect(await materialService.listResources(ctx, event.id)).toHaveLength(2);
		expect(await materialService.listPhotos(ctx, event.id)).toHaveLength(1);

		// ...but absent from the public view while the event is still upcoming.
		const upcoming = await eventService.getPublishedEventBySlug(ctx, event.slug, 'en');
		expect(upcoming.hasEnded).toBe(false);
		expect(upcoming.resources).toEqual([]);
		expect(upcoming.photos).toEqual([]);

		await markFinished(event.id);

		const finished = await eventService.getPublishedEventBySlug(ctx, event.slug, 'en');
		expect(finished.hasEnded).toBe(true);
		expect(finished.resources).toHaveLength(2);
		expect(finished.photos).toHaveLength(1);
	});

	it('keeps materials hidden while the event is in progress', async () => {
		// registrationState flips to 'closed' at startAt, but materials wait for
		// endAt. An event that is running right now must not leak its slides.
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		const db = await getTestDb();
		await db
			.update(events)
			.set({
				startAt: new Date(Date.now() - 3_600_000),
				endAt: new Date(Date.now() + 3_600_000)
			})
			.where(eq(events.id, event.id));

		await materialService.setResources(ctx, event.id, { resources: [slides] });

		const view = await eventService.getPublishedEventBySlug(ctx, event.slug, 'en');
		expect(view.registrationState).toBe('closed');
		expect(view.hasEnded).toBe(false);
		expect(view.resources).toEqual([]);
	});
});

describe('setResources', () => {
	it('replaces the list, dropping what is no longer sent', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		await materialService.setResources(ctx, event.id, { resources: [slides, repo] });
		await materialService.setResources(ctx, event.id, { resources: [repo] });

		const stored = await materialService.listResources(ctx, event.id);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.title).toBe('Demo repository');
	});

	it('takes order from array position', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		await materialService.setResources(ctx, event.id, { resources: [repo, slides] });

		const stored = await materialService.listResources(ctx, event.id);
		expect(stored.map((r) => r.title)).toEqual(['Demo repository', 'Serverless workshop slides']);
		expect(stored.map((r) => r.sortOrder)).toEqual([0, 1]);
	});

	it('accepts an empty list as "remove everything"', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		await materialService.setResources(ctx, event.id, { resources: [slides] });
		await materialService.setResources(ctx, event.id, { resources: [] });

		expect(await materialService.listResources(ctx, event.id)).toEqual([]);
	});

	it('keeps size and content type null for a link', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		await materialService.setResources(ctx, event.id, { resources: [repo] });

		const [stored] = await materialService.listResources(ctx, event.id);
		expect(stored?.sizeBytes).toBeNull();
		expect(stored?.contentType).toBeNull();
	});
});

describe('setPhotos', () => {
	it('stores a batch in order and preserves captions', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		await materialService.setPhotos(ctx, event.id, {
			photos: [
				{ url: '/uploads/2026/08/a.jpg', caption: 'Opening talk' },
				{ url: '/uploads/2026/08/b.jpg', caption: null },
				{ url: '/uploads/2026/08/c.jpg', caption: 'Group photo' }
			]
		});

		const stored = await materialService.listPhotos(ctx, event.id);
		expect(stored.map((p) => p.url)).toEqual([
			'/uploads/2026/08/a.jpg',
			'/uploads/2026/08/b.jpg',
			'/uploads/2026/08/c.jpg'
		]);
		expect(stored.map((p) => p.caption)).toEqual(['Opening talk', null, 'Group photo']);
	});

	it('cascades away when the event is deleted', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());

		await materialService.setPhotos(ctx, event.id, {
			photos: [{ url: '/uploads/2026/08/a.jpg', caption: null }]
		});
		await eventService.deleteEvent(ctx, event.id);

		expect(await materialService.listPhotos(ctx, event.id)).toEqual([]);
	});
});
