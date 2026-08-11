import { z } from 'zod';
import { BASE_LOCALE, localeSchema } from '../locale.js';
import { imageUrlSchema, publishStatusSchema, slugSchema, text } from '../primitives.js';
import { isRichTextEmpty, richTextDocSchema } from '../rich-text.js';

export const articleTranslationInputSchema = z.object({
	locale: localeSchema,
	title: text(3, 200, 'Title'),
	/** Used for listing cards, meta description and Open Graph. */
	excerpt: text(0, 320, 'Excerpt').optional(),
	content: richTextDocSchema.refine((doc) => !isRichTextEmpty(doc), {
		message: 'Content is required'
	})
});

export const articleInputSchema = z
	.object({
		slug: slugSchema,
		coverImageUrl: imageUrlSchema.optional(),
		category: text(0, 60, 'Category').optional(),
		status: publishStatusSchema,
		translations: z.array(articleTranslationInputSchema).min(1, 'At least one language is required')
	})
	.refine((a) => a.translations.some((t) => t.locale === BASE_LOCALE), {
		message: `A ${BASE_LOCALE} translation is required`,
		path: ['translations']
	})
	.refine((a) => new Set(a.translations.map((t) => t.locale)).size === a.translations.length, {
		message: 'Duplicate locale in translations',
		path: ['translations']
	});

export type ArticleInput = z.infer<typeof articleInputSchema>;
export type ArticleTranslationInput = z.infer<typeof articleTranslationInputSchema>;
