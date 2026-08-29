import { eventTranslations, events, type Event, type EventTranslation } from '@awsug/db';
import {
	buildEmbedUrl,
	DEFAULT_FORM_BLOCKS,
	isContent,
	NotFoundError,
	SlugTakenError,
	type EventInput,
	type FormDefinition,
	type Locale,
	type RegistrationState,
	type RichTextDoc,
	type SetEventFormInput
} from '@awsug/shared';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { renderRichText } from '../content/render.js';
import { currentTime, type AppContext } from '../context.js';
import {
	listPhotos,
	listResources,
	type EventPhotoView,
	type EventResourceView
} from './materials.js';
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
	requiresApproval: boolean;
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
	/**
	 * True once `endAt` has passed. Gates the materials sections: slides and
	 * photos are for people who were there, or who are catching up afterwards,
	 * and showing them beforehand would be odd at best.
	 */
	hasEnded: boolean;
	/** null when capacity is unlimited. */
	seatsRemaining: number | null;
	/** True when this locale has no translation and the base locale is shown. */
	translationFallback: boolean;
}

/**
 * A form block on its way to a browser.
 *
 * `html` is the difference from the stored block: rich text content is
 * rendered and sanitised *here*, server-side, exactly as `descriptionHtml` is.
 * The page then injects a string it was handed rather than running a renderer
 * over JSON that arrived from the network, which is the only version of this
 * that is safe to put behind `{@html}`.
 */
export type PublicFormBlock = FormDefinition[number] & { html?: string };

function toPublicForm(blocks: FormDefinition): PublicFormBlock[] {
	return blocks.map((block) =>
		isContent(block) && block.type === 'richText'
			? // The source document is dropped once it has been rendered: the page
				// only ever needs the sanitised HTML, and shipping the JSON alongside
				// it would both bloat the payload and leave a raw document sitting
				// there inviting someone to render it in the browser instead.
				{ ...block, doc: null, html: renderRichText(block.doc) }
			: block
	);
}

export type EventWithTranslations = Event & { translations: EventTranslation[] };

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

/**
 * Whether the event is over.
 *
 * Note the difference from `registrationState === 'closed'`, which flips at
 * `startAt` — registration shuts when the event *begins*. This reads `endAt`,
 * so an event in progress has closed registration but has not ended, and its
 * materials stay hidden until the day is actually done.
 */
export function hasEnded(event: Event, now: Date): boolean {
	return event.endAt <= now;
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
		requiresApproval: event.requiresApproval,
		capacity: event.capacity,
		registeredCount: event.registeredCount,
		status: event.status,
		title: t.title,
		description: t.description,
		descriptionHtml: renderRichText(t.description),
		locationName: t.locationName,
		registrationState: deriveRegistrationState(event, now),
		hasEnded: hasEnded(event, now),
		seatsRemaining: event.capacity > 0 ? Math.max(0, event.capacity - event.registeredCount) : null,
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
		where: timeFilter
			? and(eq(events.status, 'published'), timeFilter)
			: eq(events.status, 'published'),
		// Upcoming reads soonest-first; past reads most-recent-first.
		orderBy: when === 'past' ? [desc(events.startAt)] : [asc(events.startAt)],
		...(options.limit === undefined ? {} : { limit: options.limit }),
		with: { translations: true }
	});

	return rows.map((row) => toView(row as EventWithTranslations, options.locale, now));
}

/**
 * The detail page's shape. Lists never carry materials — they would be dozens
 * of extra rows nobody renders — so the two views are separate types rather
 * than one type with optional fields.
 */
export interface EventDetailView extends EventView {
	/** Empty until the event has ended. */
	resources: EventResourceView[];
	/** Empty until the event has ended. */
	photos: EventPhotoView[];
	/** The registration form, with rich text already rendered. */
	form: PublicFormBlock[];
}

export async function getPublishedEventBySlug(
	ctx: AppContext,
	slug: string,
	locale: Locale
): Promise<EventDetailView> {
	const row = await ctx.db.query.events.findFirst({
		where: and(eq(events.slug, slug), eq(events.status, 'published')),
		with: { translations: true }
	});

	if (!row) throw new NotFoundError('Event');

	const event = row as EventWithTranslations;
	const view = toView(event, locale, currentTime(ctx));

	/*
	 * Returning empty arrays before the event ends, rather than leaving the
	 * fields undefined, is what keeps the gate reliable: the page renders
	 * whatever it is given, so there is no way for a template to leak materials
	 * early by forgetting a condition. It also skips two queries for the
	 * upcoming events that make up most of the traffic.
	 */
	const form = toPublicForm(event.formSchema);

	if (!view.hasEnded) return { ...view, resources: [], photos: [], form };

	const [resources, photos] = await Promise.all([
		listResources(ctx, event.id),
		listPhotos(ctx, event.id)
	]);

	return { ...view, resources, photos, form };
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

export async function getEventById(ctx: AppContext, id: string): Promise<EventWithTranslations> {
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
					coverImageUrl: row.coverImageUrl || null,
					requiresApproval: row.requiresApproval,
					// Seeded rather than left empty, so a new event has the same
					// registration form the site has always had and an organiser opts
					// *into* changing it rather than having to build one first.
					formSchema: DEFAULT_FORM_BLOCKS
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
					requiresApproval: row.requiresApproval,
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

/**
 * Recomputes registeredCount from the registrations table. Repair tool.
 *
 * Counts approved rows only, matching what claims and releases a seat. Without
 * the filter this would quietly re-inflate the counter with every pending and
 * rejected application the moment anyone ran it.
 */
export async function recountRegistrations(ctx: AppContext, eventId: string): Promise<number> {
	const [row] = await ctx.db
		.update(events)
		.set({
			registeredCount: sql`(SELECT count(*)::int FROM registrations WHERE registrations.event_id = ${eventId} AND registrations.status = 'approved')`,
			updatedAt: new Date()
		})
		.where(eq(events.id, eventId))
		.returning({ registeredCount: events.registeredCount });

	if (!row) throw new NotFoundError('Event');
	return row.registeredCount;
}

/* -------------------------------------------------------------------------- */
/* Registration form                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The form is read and written on its own, not through `updateEvent`.
 *
 * Keeping it off the event form means saving a typo in the venue name cannot
 * overwrite the questions, and vice versa — two editors can have both pages
 * open without one silently discarding the other's work.
 */
export async function getFormSchema(ctx: AppContext, eventId: string): Promise<FormDefinition> {
	const [row] = await ctx.db
		.select({ formSchema: events.formSchema })
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);

	if (!row) throw new NotFoundError('Event');
	return row.formSchema;
}

export async function setFormSchema(
	ctx: AppContext,
	eventId: string,
	input: SetEventFormInput
): Promise<FormDefinition> {
	const [updated] = await ctx.db
		.update(events)
		.set({ formSchema: input.blocks, updatedAt: currentTime(ctx) })
		.where(eq(events.id, eventId))
		.returning({ formSchema: events.formSchema });

	if (!updated) throw new NotFoundError('Event');
	return updated.formSchema;
}
