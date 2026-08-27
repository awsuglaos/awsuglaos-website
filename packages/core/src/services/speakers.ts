import {
	eventSpeakerTranslations,
	eventSpeakers,
	eventTranslations,
	events,
	speakerTranslations,
	speakers,
	type EventSpeaker,
	type EventSpeakerTranslation,
	type Speaker,
	type SpeakerTranslation
} from '@awsug/db';
import {
	COMMUNITY_ROLE_ORDER,
	NotFoundError,
	SlugTakenError,
	type CommunityRole,
	type Locale,
	type SetEventSpeakersInput,
	type SetSpeakerOrderInput,
	type SpeakerInput
} from '@awsug/shared';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';
import { isUniqueViolation } from '../util/db-errors.js';
import { pickTranslation } from '../util/translation.js';

export type SpeakerWithTranslations = Speaker & { translations: SpeakerTranslation[] };

/** Leader first regardless of how the role happens to be stored. Mirrors sponsors.tierRank. */
function roleRank(column: typeof speakers.communityRole) {
	return sql`array_position(ARRAY[${sql.join(
		COMMUNITY_ROLE_ORDER.map((r) => sql`${r}`),
		sql`, `
	)}]::text[], ${column}::text)`;
}

/** A speaker as shown on an event page, with their talk for that event. */
export interface EventSpeakerView {
	id: string;
	speakerId: string;
	slug: string;
	name: string;
	title: string | null;
	bio: string | null;
	company: string | null;
	photoUrl: string | null;
	websiteUrl: string | null;
	linkedinUrl: string | null;
	githubUrl: string | null;
	talkTitle: string | null;
	abstract: string | null;
	sortOrder: number;
}

/* -------------------------------------------------------------------------- */
/* Speaker directory                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The whole directory, team first.
 *
 * `array_position` puts null (role 'none') last, which is what we want: the
 * people who run the group head the list, everyone else follows by slug.
 */
export async function listSpeakers(ctx: AppContext): Promise<SpeakerWithTranslations[]> {
	const rows = await ctx.db.query.speakers.findMany({
		orderBy: [roleRank(speakers.communityRole), asc(speakers.sortOrder), asc(speakers.slug)],
		with: { translations: true }
	});
	return rows as SpeakerWithTranslations[];
}

export async function getSpeakerById(
	ctx: AppContext,
	id: string
): Promise<SpeakerWithTranslations> {
	const row = await ctx.db.query.speakers.findFirst({
		where: eq(speakers.id, id),
		with: { translations: true }
	});
	if (!row) throw new NotFoundError('Speaker');
	return row as SpeakerWithTranslations;
}

export async function createSpeaker(
	ctx: AppContext,
	input: SpeakerInput
): Promise<SpeakerWithTranslations> {
	const { translations, ...row } = input;

	return ctx.db.transaction(async (tx) => {
		let created: Speaker | undefined;
		try {
			[created] = await tx
				.insert(speakers)
				.values({
					slug: row.slug,
					photoUrl: row.photoUrl || null,
					company: row.company || null,
					communityRole: row.communityRole,
					sortOrder: row.sortOrder,
					websiteUrl: row.websiteUrl || null,
					linkedinUrl: row.linkedinUrl || null,
					githubUrl: row.githubUrl || null
				})
				.returning();
		} catch (error) {
			if (isUniqueViolation(error)) throw new SlugTakenError(row.slug);
			throw error;
		}
		if (!created) throw new Error('Speaker insert returned no row');

		const inserted = await tx
			.insert(speakerTranslations)
			.values(
				translations.map((t) => ({
					speakerId: created.id,
					locale: t.locale,
					name: t.name,
					title: t.title || null,
					bio: t.bio || null
				}))
			)
			.returning();

		return { ...created, translations: inserted };
	});
}

export async function updateSpeaker(
	ctx: AppContext,
	id: string,
	input: SpeakerInput
): Promise<SpeakerWithTranslations> {
	const { translations, ...row } = input;

	return ctx.db.transaction(async (tx) => {
		let updated: Speaker | undefined;
		try {
			[updated] = await tx
				.update(speakers)
				.set({
					slug: row.slug,
					photoUrl: row.photoUrl || null,
					company: row.company || null,
					communityRole: row.communityRole,
					sortOrder: row.sortOrder,
					websiteUrl: row.websiteUrl || null,
					linkedinUrl: row.linkedinUrl || null,
					githubUrl: row.githubUrl || null,
					updatedAt: currentTime(ctx)
				})
				.where(eq(speakers.id, id))
				.returning();
		} catch (error) {
			if (isUniqueViolation(error)) throw new SlugTakenError(row.slug);
			throw error;
		}
		if (!updated) throw new NotFoundError('Speaker');

		await tx.delete(speakerTranslations).where(eq(speakerTranslations.speakerId, id));
		const inserted = await tx
			.insert(speakerTranslations)
			.values(
				translations.map((t) => ({
					speakerId: id,
					locale: t.locale,
					name: t.name,
					title: t.title || null,
					bio: t.bio || null
				}))
			)
			.returning();

		return { ...updated, translations: inserted };
	});
}

export async function deleteSpeaker(ctx: AppContext, id: string): Promise<void> {
	const deleted = await ctx.db
		.delete(speakers)
		.where(eq(speakers.id, id))
		.returning({ id: speakers.id });
	if (deleted.length === 0) throw new NotFoundError('Speaker');
}

/**
 * Replaces the role and position of every speaker on the order board in one
 * transaction.
 *
 * The board submits everyone rather than only what moved, for the same reason an
 * event line-up does: dragging someone from Organiser to Co-leader is a role
 * change *and* a reorder, and two separate writes could interleave and leave two
 * people claiming the same slot. One transaction cannot.
 */
export async function setSpeakerOrder(ctx: AppContext, input: SetSpeakerOrderInput): Promise<void> {
	if (input.speakers.length === 0) return;

	const now = currentTime(ctx);

	await ctx.db.transaction(async (tx) => {
		for (const entry of input.speakers) {
			await tx
				.update(speakers)
				.set({
					communityRole: entry.communityRole,
					sortOrder: entry.sortOrder,
					updatedAt: now
				})
				.where(eq(speakers.id, entry.id));
		}
	});
}

/* -------------------------------------------------------------------------- */
/* Public directory                                                           */
/* -------------------------------------------------------------------------- */

/** A speaker as shown on a public card — one locale, already resolved. */
export interface SpeakerCardView {
	id: string;
	slug: string;
	name: string;
	title: string | null;
	bio: string | null;
	company: string | null;
	photoUrl: string | null;
	communityRole: CommunityRole;
	websiteUrl: string | null;
	linkedinUrl: string | null;
	githubUrl: string | null;
	/** Drives `lastmod` in the sitemap. */
	updatedAt: Date;
}

/** One appearance on the profile page: the talk, and the event it was given at. */
export interface SpeakerTalkView {
	eventSlug: string;
	eventTitle: string;
	startAt: Date;
	talkTitle: string | null;
	abstract: string | null;
}

export interface SpeakerProfileView extends SpeakerCardView {
	talks: SpeakerTalkView[];
}

function toCardView(row: SpeakerWithTranslations, locale: Locale): SpeakerCardView {
	const profile = pickTranslation(row.translations, locale);

	return {
		id: row.id,
		slug: row.slug,
		// Falling back to the slug keeps a half-translated profile readable rather
		// than rendering a nameless card.
		name: profile?.name ?? row.slug,
		title: profile?.title ?? null,
		bio: profile?.bio ?? null,
		company: row.company,
		photoUrl: row.photoUrl,
		communityRole: row.communityRole,
		websiteUrl: row.websiteUrl,
		linkedinUrl: row.linkedinUrl,
		githubUrl: row.githubUrl,
		updatedAt: row.updatedAt
	};
}

/**
 * The public directory. `team: true` narrows to the people who run the group —
 * that is what the landing page section and the top of /speakers show.
 */
export async function listPublicSpeakers(
	ctx: AppContext,
	options: { locale: Locale; team?: boolean }
): Promise<SpeakerCardView[]> {
	const rows = (await ctx.db.query.speakers.findMany({
		where: options.team ? ne(speakers.communityRole, 'none') : undefined,
		orderBy: [roleRank(speakers.communityRole), asc(speakers.sortOrder), asc(speakers.slug)],
		with: { translations: true }
	})) as SpeakerWithTranslations[];

	return rows.map((row) => toCardView(row, options.locale));
}

/**
 * One profile, plus every published event they have spoken at.
 *
 * Draft events are excluded here rather than filtered by the caller — an
 * unpublished meetup must not leak its title through a speaker page.
 */
export async function getSpeakerBySlug(
	ctx: AppContext,
	slug: string,
	locale: Locale
): Promise<SpeakerProfileView> {
	const row = (await ctx.db.query.speakers.findFirst({
		where: eq(speakers.slug, slug),
		with: { translations: true }
	})) as SpeakerWithTranslations | undefined;

	if (!row) throw new NotFoundError('Speaker');

	const talkRows = await ctx.db
		.select({
			eventSlug: events.slug,
			startAt: events.startAt,
			eventSpeakerId: eventSpeakers.id
		})
		.from(eventSpeakers)
		.innerJoin(events, eq(events.id, eventSpeakers.eventId))
		.where(and(eq(eventSpeakers.speakerId, row.id), eq(events.status, 'published')))
		.orderBy(desc(events.startAt));

	const talks: SpeakerTalkView[] = [];

	if (talkRows.length > 0) {
		// Two small IN queries beat a join that would multiply rows by locale and
		// then need de-duplicating in JavaScript anyway.
		const [eventTitles, talkTexts] = await Promise.all([
			ctx.db
				.select({
					slug: events.slug,
					locale: eventTranslations.locale,
					title: eventTranslations.title
				})
				.from(eventTranslations)
				.innerJoin(events, eq(events.id, eventTranslations.eventId))
				.where(
					inArray(
						events.slug,
						talkRows.map((t) => t.eventSlug)
					)
				),
			ctx.db
				.select({
					eventSpeakerId: eventSpeakerTranslations.eventSpeakerId,
					locale: eventSpeakerTranslations.locale,
					talkTitle: eventSpeakerTranslations.talkTitle,
					abstract: eventSpeakerTranslations.abstract
				})
				.from(eventSpeakerTranslations)
				.where(
					inArray(
						eventSpeakerTranslations.eventSpeakerId,
						talkRows.map((t) => t.eventSpeakerId)
					)
				)
		]);

		for (const talk of talkRows) {
			const title = pickTranslation(
				eventTitles.filter((t) => t.slug === talk.eventSlug),
				locale
			);
			const text = pickTranslation(
				talkTexts.filter((t) => t.eventSpeakerId === talk.eventSpeakerId),
				locale
			);

			talks.push({
				eventSlug: talk.eventSlug,
				eventTitle: title?.title ?? talk.eventSlug,
				startAt: talk.startAt,
				talkTitle: text?.talkTitle ?? null,
				abstract: text?.abstract ?? null
			});
		}
	}

	return { ...toCardView(row, locale), talks };
}

/* -------------------------------------------------------------------------- */
/* Line-up for an event                                                       */
/* -------------------------------------------------------------------------- */

export async function listEventSpeakers(
	ctx: AppContext,
	eventId: string,
	locale: Locale
): Promise<EventSpeakerView[]> {
	const rows = await ctx.db.query.eventSpeakers.findMany({
		where: eq(eventSpeakers.eventId, eventId),
		orderBy: [asc(eventSpeakers.sortOrder)],
		with: {
			speaker: { with: { translations: true } },
			translations: true
		}
	});

	return (
		rows as (EventSpeaker & {
			speaker: SpeakerWithTranslations;
			translations: EventSpeakerTranslation[];
		})[]
	).map((row) => {
		const profile = pickTranslation(row.speaker.translations, locale);
		const talk = pickTranslation(row.translations, locale);

		return {
			id: row.id,
			speakerId: row.speaker.id,
			slug: row.speaker.slug,
			name: profile?.name ?? row.speaker.slug,
			title: profile?.title ?? null,
			bio: profile?.bio ?? null,
			company: row.speaker.company,
			photoUrl: row.speaker.photoUrl,
			websiteUrl: row.speaker.websiteUrl,
			linkedinUrl: row.speaker.linkedinUrl,
			githubUrl: row.speaker.githubUrl,
			talkTitle: talk?.talkTitle ?? null,
			abstract: talk?.abstract ?? null,
			sortOrder: row.sortOrder
		};
	});
}

/**
 * Replaces an event's whole line-up in one transaction.
 *
 * The editor submits the full list rather than individual add/remove calls, so
 * ordering stays coherent — reordering four speakers is one atomic write rather
 * than four that could interleave and leave duplicate sort positions.
 */
export async function setEventSpeakers(
	ctx: AppContext,
	eventId: string,
	input: SetEventSpeakersInput
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		const existing = await tx
			.select({ id: eventSpeakers.id })
			.from(eventSpeakers)
			.where(eq(eventSpeakers.eventId, eventId));

		if (existing.length > 0) {
			// Talk translations cascade from the join row.
			await tx.delete(eventSpeakers).where(
				inArray(
					eventSpeakers.id,
					existing.map((e) => e.id)
				)
			);
		}

		for (const [index, entry] of input.speakers.entries()) {
			const [link] = await tx
				.insert(eventSpeakers)
				.values({
					eventId,
					speakerId: entry.speakerId,
					sortOrder: entry.sortOrder ?? index
				})
				.returning();

			if (!link) throw new Error('Event speaker insert returned no row');

			const talks = entry.translations.filter((t) => t.talkTitle || t.abstract);
			if (talks.length > 0) {
				await tx.insert(eventSpeakerTranslations).values(
					talks.map((t) => ({
						eventSpeakerId: link.id,
						locale: t.locale,
						talkTitle: t.talkTitle || null,
						abstract: t.abstract || null
					}))
				);
			}
		}
	});
}
