import { z } from 'zod';
import { isStoredAssetUrl, resourceKindSchema } from '../primitives.js';

/**
 * Event materials: the resources list and the photo gallery.
 *
 * Both are saved as a whole list rather than row by row, which is how the
 * speaker line-up already works — it makes ordering fall out of array position
 * instead of needing a separate reorder endpoint.
 */

/**
 * Unlike `imageUrlSchema`, an empty string is not acceptable here: a resource
 * with no destination is not a draft, it is a broken row. Same shape rules
 * otherwise — a site-relative upload path or an absolute http(s) URL.
 */
const resourceUrlSchema = z
	.string()
	.trim()
	.min(1, 'Upload a file or paste a link')
	.max(2048)
	.refine(isStoredAssetUrl, 'Upload a file, or paste a full URL starting with https://');

export const eventResourceInputSchema = z.object({
	title: z.string().trim().min(1, 'Give the resource a name').max(160),
	kind: resourceKindSchema.default('document'),
	url: resourceUrlSchema,
	/**
	 * Both null for a link — we only know what we stored ourselves. They exist
	 * so the page can show "PDF · 2.4MB" without fetching the file to find out.
	 */
	sizeBytes: z.coerce.number().int().nonnegative().nullable().default(null),
	contentType: z.string().trim().max(120).nullable().default(null)
});

export type EventResourceInput = z.infer<typeof eventResourceInputSchema>;

export const setEventResourcesInputSchema = z.object({
	// A ceiling so a malformed client cannot ask us to write unbounded rows in
	// one transaction. Far above any real event.
	resources: z.array(eventResourceInputSchema).max(50)
});

export type SetEventResourcesInput = z.infer<typeof setEventResourcesInputSchema>;

export const eventPhotoInputSchema = z.object({
	url: resourceUrlSchema,
	caption: z.string().trim().max(200).nullable().default(null)
});

export type EventPhotoInput = z.infer<typeof eventPhotoInputSchema>;

export const setEventPhotosInputSchema = z.object({
	photos: z.array(eventPhotoInputSchema).max(200)
});

export type SetEventPhotosInput = z.infer<typeof setEventPhotosInputSchema>;
