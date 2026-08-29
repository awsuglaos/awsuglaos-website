import { z } from 'zod';
import { BASE_LOCALE, localeSchema } from '../locale.js';
import { googleMapsUrlSchema } from '../maps.js';
import { richTextDocSchema, isRichTextEmpty } from '../rich-text.js';
import { dateSchema, imageUrlSchema, publishStatusSchema, slugSchema, sponsorTierSchema, text } from '../primitives.js';

export const eventTranslationInputSchema = z.object({
	locale: localeSchema,
	title: text(3, 200, 'Title'),
	description: richTextDocSchema.refine((doc) => !isRichTextEmpty(doc), {
		message: 'Description is required'
	}),
	/** Venue as shown to attendees — translated, unlike the map link. */
	locationName: text(1, 200, 'Location')
});

export const eventInputSchema = z
	.object({
		slug: slugSchema,
		startAt: dateSchema,
		endAt: dateSchema,
		/** 0 means unlimited — registration never auto-closes on capacity. */
		capacity: z.coerce.number().int().min(0).max(100_000),
		/** Required: every venue is pinned on Google Maps and embedded on the page. */
		locationUrl: googleMapsUrlSchema,
		coverImageUrl: imageUrlSchema.optional(),
		/*
		 * Gates new registrations behind an organiser decision. Only ever affects
		 * registrations made *after* it is switched on — anyone already holding a
		 * ticket keeps it, because the status column defaults to `approved`.
		 */
		requiresApproval: z.coerce.boolean().default(false),
		status: publishStatusSchema,
		translations: z.array(eventTranslationInputSchema).min(1, 'At least one language is required')
	})
	.refine((e) => e.endAt > e.startAt, {
		message: 'End time must be after the start time',
		path: ['endAt']
	})
	.refine((e) => e.translations.some((t) => t.locale === BASE_LOCALE), {
		message: `A ${BASE_LOCALE} translation is required`,
		path: ['translations']
	})
	.refine((e) => new Set(e.translations.map((t) => t.locale)).size === e.translations.length, {
		message: 'Duplicate locale in translations',
		path: ['translations']
	});

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventTranslationInput = z.infer<typeof eventTranslationInputSchema>;

/** Registration state, derived rather than stored, so it cannot drift. */
export const registrationStateSchema = z.enum(['open', 'full', 'closed', 'unpublished']);
export type RegistrationState = z.infer<typeof registrationStateSchema>;

/* -------------------------------------------------------------------------- */
/* Event sponsors                                                             */
/* -------------------------------------------------------------------------- */

export const eventSponsorInputSchema = z.object({
	sponsorId: z.uuid(),
	/** Overrides the sponsor's group-wide tier for this event only. */
	tier: sponsorTierSchema,
	sortOrder: z.coerce.number().int().min(0).max(9999).default(0)
});

export const setEventSponsorsInputSchema = z.object({
	sponsors: z.array(eventSponsorInputSchema)
});

export type EventSponsorInput = z.infer<typeof eventSponsorInputSchema>;
export type SetEventSponsorsInput = z.infer<typeof setEventSponsorsInputSchema>;
