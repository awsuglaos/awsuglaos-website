import { z } from 'zod';
import { imageUrlSchema, sponsorTierSchema, text } from '../primitives.js';

export const sponsorInputSchema = z.object({
	name: text(1, 160, 'Name'),
	logoUrl: imageUrlSchema.refine((v) => v !== '', 'A logo is required'),
	websiteUrl: z.url().max(2048).optional().or(z.literal('')),
	tier: sponsorTierSchema,
	sortOrder: z.coerce.number().int().min(0).max(9999).default(0)
});

export type SponsorInput = z.infer<typeof sponsorInputSchema>;

/** Display order for tiers on the landing page. */
export const SPONSOR_TIER_ORDER = ['platinum', 'gold', 'silver', 'community'] as const;
