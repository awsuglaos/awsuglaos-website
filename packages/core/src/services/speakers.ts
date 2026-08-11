import {
	eventSpeakerTranslations,
	eventSpeakers,
	speakerTranslations,
	speakers,
	type EventSpeaker,
	type EventSpeakerTranslation,
	type Speaker,
	type SpeakerTranslation
} from '@awsug/db';
import {
	NotFoundError,
	SlugTakenError,
	type Locale,
	type SetEventSpeakersInput,
	type SpeakerInput
} from '@awsug/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';
import { isUniqueViolation } from '../util/db-errors.js';
import { pickTranslation } from '../util/translation.js';

export type SpeakerWithTranslations = Speaker & { translations: SpeakerTranslation[] };

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

export async function listSpeakers(ctx: AppContext): Promise<SpeakerWithTranslations[]> {
	const rows = await ctx.db.query.speakers.findMany({
		orderBy: [asc(speakers.slug)],
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
