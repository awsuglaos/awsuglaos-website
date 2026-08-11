import { z } from 'zod';
import { BASE_LOCALE, localeSchema } from '../locale.js';
import { imageUrlSchema, slugSchema, text } from '../primitives.js';

export const speakerTranslationInputSchema = z.object({
	locale: localeSchema,
	name: text(2, 160, 'Name'),
	/** Role or job title, e.g. "Solutions Architect". */
	title: text(0, 160, 'Title').optional(),
	bio: text(0, 4000, 'Bio').optional()
});

export const speakerInputSchema = z
	.object({
		slug: slugSchema,
		photoUrl: imageUrlSchema.optional(),
		company: text(0, 160, 'Company').optional(),
		websiteUrl: z.url().max(2048).optional().or(z.literal('')),
		linkedinUrl: z.url().max(2048).optional().or(z.literal('')),
		githubUrl: z.url().max(2048).optional().or(z.literal('')),
		translations: z
			.array(speakerTranslationInputSchema)
			.min(1, 'At least one language is required')
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
