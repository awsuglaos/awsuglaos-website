import { eventTranslations, events, type Event, type EventTranslation } from '@awsug/db';
import {
	buildEmbedUrl,
	NotFoundError,
	SlugTakenError,
	type EventInput,
	type Locale,
	type RegistrationState,
	type RichTextDoc
} from '@awsug/shared';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { renderRichText } from '../content/render.js';
import { currentTime, type AppContext } from '../context.js';
import { resolveLocation } from '../maps/resolve.js';
import { isUniqueViolation } from '../util/db-errors.js';
import { isFallback, pickTranslation } from '../util/translation.js';

export interface EventView {
	id: string;
	slug: string;
	startAt: Date;
	endAt: Date;
	locationUrl: string;
	locationLat: number | null;
	locationLng: number | null;
	/** Ready-to-use iframe src, or null when there is nothing to show. */
	mapEmbedUrl: string | null;
	coverImageUrl: string | null;
	capacity: number;
	registeredCount: number;
	status: 'draft' | 'published';
	title: string;
	/** The stored document, for clients that want the structure. */
	description: RichTextDoc;
	/** Sanitised HTML, safe to inject. */
	descriptionHtml: string;
	locationName: string;
	registrationState: RegistrationState;
	/** null when capacity is unlimited. */
	seatsRemaining: number | null;
	/** True when this locale has no translation and the base locale is shown. */
	translationFallback: boolean;
}

type EventWithTranslations = Event & { translations: EventTranslation[] };

/**
 * Registration state is always derived, never stored, so it cannot drift out of
 * sync with the event's dates or seat count.
 */
export function deriveRegistrationState(event: Event, now: Date): RegistrationState {
	if (event.status !== 'published') return 'unpublished';
	if (event.startAt <= now) return 'closed';
	if (event.capacity > 0 && event.registeredCount >= event.capacity) return 'full';
	return 'open';
}

function toView(event: EventWithTranslations, locale: Locale, now: Date): EventView {
	const t = pickTranslation(event.translations, locale);
	if (!t) throw new NotFoundError('Event translation');

	return {
		id: event.id,
		slug: event.slug,
		startAt: event.startAt,
		endAt: event.endAt,
		locationUrl: event.locationUrl,
		locationLat: event.locationLat,
		locationLng: event.locationLng,
		mapEmbedUrl: buildEmbedUrl({
			coordinates:
				event.locationLat !== null && event.locationLng !== null
					? { lat: event.locationLat, lng: event.locationLng }
					: null,
			locationUrl: event.locationUrl,
			locationName: t.locationName
		}),
		coverImageUrl: event.coverImageUrl,
		capacity: event.capacity,
		registeredCount: event.registeredCount,
		status: event.status,
		title: t.title,
		description: t.description,
		descriptionHtml: renderRichText(t.description),
		locationName: t.locationName,
		registrationState: deriveRegistrationState(event, now),
		seatsRemaining:
			event.capacity > 0 ? Math.max(0, event.capacity - event.registeredCount) : null,
		translationFallback: isFallback(event.translations, locale)
	};
}

export interface ListEventsOptions {
	locale: Locale;
	when?: 'upcoming' | 'past' | 'all';
	limit?: number;
}

export async function listPublishedEvents(
	ctx: AppContext,
	options: ListEventsOptions
): Promise<EventView[]> {
	const now = currentTime(ctx);
	const when = options.when ?? 'all';

	const timeFilter =
		when === 'upcoming'
			? gte(events.startAt, now)
			: when === 'past'
				? lt(events.startAt, now)
				: undefined;

	const rows = await ctx.db.query.events.findMany({
		where: timeFilter ? and(eq(events.status, 'published'), timeFilter) : eq(events.status, 'published'),
		// Upcoming reads soonest-first; past reads most-recent-first.
		orderBy: when === 'past' ? [desc(events.startAt)] : [asc(events.startAt)],
		...(options.limit === undefined ? {} : { limit: options.limit }),
		with: { translations: true }
	});

	return rows.map((row) => toView(row as EventWithTranslations, options.locale, now));
}

export async function getPublishedEventBySlug(
	ctx: AppContext,
	slug: string,
	locale: Locale
): Promise<EventView> {
	const row = await ctx.db.query.events.findFirst({
		where: and(eq(events.slug, slug), eq(events.status, 'published')),
		with: { translations: true }
	});

	if (!row) throw new NotFoundError('Event');
	return toView(row as EventWithTranslations, locale, currentTime(ctx));
}

/* -------------------------------------------------------------------------- */
/* Backoffice                                                                 */
/* -------------------------------------------------------------------------- */

export async function listAllEvents(ctx: AppContext): Promise<EventWithTranslations[]> {
	const rows = await ctx.db.query.events.findMany({
		orderBy: [desc(events.startAt)],
		with: { translations: true }
	});
	return rows as EventWithTranslations[];
}

export async function getEventById(
	ctx: AppContext,
	id: string
): Promise<EventWithTranslations> {
	const row = await ctx.db.query.events.findFirst({
		where: eq(events.id, id),
		with: { translations: true }
	});
	if (!row) throw new NotFoundError('Event');
	return row as EventWithTranslations;
}

export async function createEvent(
	ctx: AppContext,
	input: EventInput
): Promise<EventWithTranslations> {
	const { translations, ...row } = input;

	// Outside the transaction: this may follow a redirect to Google, and holding
	// a database transaction open across a network call is how connection pools
	// get starved.
	const location = await resolveLocation(row.locationUrl);

	return ctx.db.transaction(async (tx) => {
		let created: Event | undefined;
		try {
			[created] = await tx
				.insert(events)
				.values({
					slug: row.slug,
					startAt: row.startAt,
					endAt: row.endAt,
					capacity: row.capacity,
					status: row.status,
					locationUrl: location.locationUrl,
					locationLat: location.coordinates?.lat ?? null,
					locationLng: location.coordinates?.lng ?? null,
					coverImageUrl: row.coverImageUrl || null
				})
				.returning();
		} catch (error) {
			if (isUniqueViolation(error)) throw new SlugTakenError(row.slug);
			throw error;
		}
		if (!created) throw new Error('Event insert returned no row');

		const inserted = await tx
			.insert(eventTranslations)
			.values(translations.map((t) => ({ ...t, eventId: created.id })))
			.returning();

		return { ...created, translations: inserted };
	});
}

export async function updateEvent(
	ctx: AppContext,
	id: string,
	input: EventInput
): Promise<EventWithTranslations> {
	const { translations, ...row } = input;
	const location = await resolveLocation(row.locationUrl);

	return ctx.db.transaction(async (tx) => {
		let updated: Event | undefined;
		try {
			[updated] = await tx
				.update(events)
				.set({
					slug: row.slug,
					startAt: row.startAt,
					endAt: row.endAt,
					capacity: row.capacity,
					status: row.status,
					locationUrl: location.locationUrl,
					locationLat: location.coordinates?.lat ?? null,
					locationLng: location.coordinates?.lng ?? null,
					coverImageUrl: row.coverImageUrl || null,
					updatedAt: currentTime(ctx)
				})
				.where(eq(events.id, id))
				.returning();
		} catch (error) {
			if (isUniqueViolation(error)) throw new SlugTakenError(row.slug);
			throw error;
		}
		if (!updated) throw new NotFoundError('Event');

		// Replace the translation set wholesale — simpler than diffing, and the
		// row count per event is tiny.
		await tx.delete(eventTranslations).where(eq(eventTranslations.eventId, id));
		const inserted = await tx
			.insert(eventTranslations)
			.values(translations.map((t) => ({ ...t, eventId: id })))
			.returning();

		return { ...updated, translations: inserted };
	});
}

export async function deleteEvent(ctx: AppContext, id: string): Promise<void> {
	const deleted = await ctx.db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
	if (deleted.length === 0) throw new NotFoundError('Event');
}

/** Recomputes registeredCount from the registrations table. Repair tool. */
export async function recountRegistrations(ctx: AppContext, eventId: string): Promise<number> {
	const [row] = await ctx.db
		.update(events)
		.set({
			registeredCount: sql`(SELECT count(*)::int FROM registrations WHERE registrations.event_id = ${eventId})`,
			updatedAt: new Date()
		})
		.where(eq(events.id, eventId))
		.returning({ registeredCount: events.registeredCount });

	if (!row) throw new NotFoundError('Event');
	return row.registeredCount;
}
