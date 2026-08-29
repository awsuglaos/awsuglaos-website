import { z } from 'zod';
import { BASE_LOCALE, localeSchema } from '../locale.js';
import { communityRoleSchema, imageUrlSchema, slugSchema, text } from '../primitives.js';
import { richTextDocSchema } from '../rich-text.js';

export const speakerTranslationInputSchema = z.object({
	locale: localeSchema,
	name: text(2, 160, 'Name'),
	/** Role or job title, e.g. "Solutions Architect". */
	title: text(0, 160, 'Title').optional(),
	/**
	 * A TipTap document, like article content — but optional, so no emptiness
	 * refinement: a profile with no bio is perfectly normal, and the service
	 * stores an empty document as NULL.
	 */
	bio: richTextDocSchema.optional()
});

export const speakerInputSchema = z
	.object({
		slug: slugSchema,
		photoUrl: imageUrlSchema.optional(),
		company: text(0, 160, 'Company').optional(),
		communityRole: communityRoleSchema.default('none'),
		/** Position within the community role, lowest first. See COMMUNITY_ROLE_ORDER. */
		sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
		websiteUrl: z.url().max(2048).optional().or(z.literal('')),
		linkedinUrl: z.url().max(2048).optional().or(z.literal('')),
		githubUrl: z.url().max(2048).optional().or(z.literal('')),
		translations: z.array(speakerTranslationInputSchema).min(1, 'At least one language is required')
	})
	.refine((s) => s.translations.some((t) => t.locale === BASE_LOCALE), {
		message: `A ${BASE_LOCALE} translation is required`,
		path: ['translations']
	})
	.refine((s) => new Set(s.translations.map((t) => t.locale)).size === s.translations.length, {
		message: 'Duplicate locale in translations',
		path: ['translations']
	});

export type SpeakerInput = z.infer<typeof speakerInputSchema>;
export type SpeakerTranslationInput = z.infer<typeof speakerTranslationInputSchema>;

/** Display order for community roles wherever the team is listed. */
export const COMMUNITY_ROLE_ORDER = ['leader', 'co_leader', 'organiser'] as const;

/* -------------------------------------------------------------------------- */
/* Ordering the directory                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The order board submits every speaker at once, role and position together.
 *
 * Same reasoning as an event line-up: one atomic write cannot leave two people
 * claiming the same slot, and dragging someone from Organiser to Co-leader is a
 * single change rather than a role edit racing a reorder.
 */
export const setSpeakerOrderInputSchema = z.object({
	speakers: z
		.array(
			z.object({
				id: z.uuid(),
				communityRole: communityRoleSchema,
				sortOrder: z.coerce.number().int().min(0).max(9999)
			})
		)
		.max(500)
});

export type SetSpeakerOrderInput = z.infer<typeof setSpeakerOrderInputSchema>;

/* -------------------------------------------------------------------------- */
/* Assigning speakers to an event                                             */
/* -------------------------------------------------------------------------- */

export const eventSpeakerTranslationInputSchema = z.object({
	locale: localeSchema,
	talkTitle: text(0, 200, 'Talk title').optional(),
	abstract: text(0, 4000, 'Abstract').optional()
});

export const eventSpeakerInputSchema = z.object({
	speakerId: z.uuid(),
	sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
	translations: z.array(eventSpeakerTranslationInputSchema).default([])
});

/** The event editor submits the whole line-up at once, so ordering is coherent. */
export const setEventSpeakersInputSchema = z.object({
	speakers: z.array(eventSpeakerInputSchema)
});

export type EventSpeakerInput = z.infer<typeof eventSpeakerInputSchema>;
export type SetEventSpeakersInput = z.infer<typeof setEventSpeakersInputSchema>;
