import { eventPhotos, eventResources, type EventPhoto, type EventResource } from '@awsug/db';
import type { SetEventPhotosInput, SetEventResourcesInput } from '@awsug/shared';
import { asc, eq } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';

/**
 * Event materials — the resources list and the photo gallery.
 *
 * Nothing here decides *visibility*. Whether a visitor may see any of it is the
 * caller's business, and lives in events.ts as `hasEnded`; keeping that out of
 * here means the backoffice can read the same functions without having to opt
 * out of a rule meant for the public site.
 */

export type EventResourceView = Pick<
	EventResource,
	'id' | 'title' | 'kind' | 'url' | 'sizeBytes' | 'contentType' | 'sortOrder'
>;

export type EventPhotoView = Pick<EventPhoto, 'id' | 'url' | 'caption' | 'sortOrder'>;

export async function listResources(
	ctx: AppContext,
	eventId: string
): Promise<EventResourceView[]> {
	return ctx.db
		.select({
			id: eventResources.id,
			title: eventResources.title,
			kind: eventResources.kind,
			url: eventResources.url,
			sizeBytes: eventResources.sizeBytes,
			contentType: eventResources.contentType,
			sortOrder: eventResources.sortOrder
		})
		.from(eventResources)
		.where(eq(eventResources.eventId, eventId))
		.orderBy(asc(eventResources.sortOrder));
}

export async function listPhotos(ctx: AppContext, eventId: string): Promise<EventPhotoView[]> {
	return ctx.db
		.select({
			id: eventPhotos.id,
			url: eventPhotos.url,
			caption: eventPhotos.caption,
			sortOrder: eventPhotos.sortOrder
		})
		.from(eventPhotos)
		.where(eq(eventPhotos.eventId, eventId))
		.orderBy(asc(eventPhotos.sortOrder));
}

/**
 * Replace the whole list in one transaction, exactly as `setEventSpeakers`
 * does.
 *
 * Position in the array *is* the order, so reordering needs no separate
 * endpoint and cannot leave two rows claiming the same slot. The cost is that
 * ids are not stable across a save; nothing references a resource by id, so
 * that costs nothing today — it would need revisiting if download counts per
 * resource ever arrived.
 */
export async function setResources(
	ctx: AppContext,
	eventId: string,
	input: SetEventResourcesInput
): Promise<void> {
	const now = currentTime(ctx);

	await ctx.db.transaction(async (tx) => {
		await tx.delete(eventResources).where(eq(eventResources.eventId, eventId));

		if (input.resources.length === 0) return;

		await tx.insert(eventResources).values(
			input.resources.map((resource, index) => ({
				eventId,
				title: resource.title,
				kind: resource.kind,
				url: resource.url,
				sizeBytes: resource.sizeBytes,
				contentType: resource.contentType,
				sortOrder: index,
				createdAt: now,
				updatedAt: now
			}))
		);
	});
}

export async function setPhotos(
	ctx: AppContext,
	eventId: string,
	input: SetEventPhotosInput
): Promise<void> {
	const now = currentTime(ctx);

	await ctx.db.transaction(async (tx) => {
		await tx.delete(eventPhotos).where(eq(eventPhotos.eventId, eventId));

		if (input.photos.length === 0) return;

		await tx.insert(eventPhotos).values(
			input.photos.map((photo, index) => ({
				eventId,
				url: photo.url,
				caption: photo.caption,
				sortOrder: index,
				createdAt: now
			}))
		);
	});
}
