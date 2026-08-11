import { z } from 'zod';

/** URL-safe ASCII slug. Kept ASCII even for Lao content so links stay shareable. */
export const slugSchema = z
	.string()
	.min(1, 'Slug is required')
	.max(120)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

/**
 * Normalise *then* validate. Chaining `.trim().toLowerCase()` after `z.email()`
 * would run the transforms only after validation had already rejected the
 * input, so " Someone@Example.LA " would fail instead of becoming
 * "someone@example.la". Getting this order right is also what makes the
 * (event_id, lower(email)) unique index collapse duplicates as intended.
 */
export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email('Enter a valid email address').max(254));

/**
 * Phone numbers are stored in E.164. Attendees may be local or international, so
 * we accept both a Lao domestic number (020 xxxxxxxx) and a full +country form,
 * normalising to E.164 on the way in.
 */
const LAO_COUNTRY_CODE = '856';

export const phoneSchema = z
	.string()
	.trim()
	.transform((raw) => raw.replace(/[\s\-().]/g, ''))
	.refine((v) => /^\+?[0-9]{6,15}$/.test(v), 'Enter a valid phone number')
	.transform((v) => {
		if (v.startsWith('+')) return v;
		// Lao domestic numbers are written with a leading 0 — swap it for +856.
		if (v.startsWith('0')) return `+${LAO_COUNTRY_CODE}${v.slice(1)}`;
		return `+${v}`;
	});

/** Trimmed, non-empty, length-bounded human text. */
export function text(min: number, max: number, label = 'This field') {
	return z
		.string()
		.trim()
		.min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
		.max(max, `${label} must be at most ${max} characters`);
}

export const idSchema = z.uuid();

/**
 * Where an image lives: either an absolute http(s) URL (a logo hosted
 * elsewhere) or a site-relative path such as `/uploads/2026/08/x.png`.
 *
 * Uploads are stored relative on purpose. An absolute URL would bake the
 * current origin into every row, so moving from a preview host to
 * awsuglaos.la would leave every stored image pointing at the old domain —
 * and it would mean the API had to know the browser's origin in order to sign
 * an upload, which it does not.
 *
 * Protocol-relative `//host/path` is rejected: it looks relative but is not.
 */
export const imageUrlSchema = z
	.string()
	.trim()
	.max(2048)
	.refine(
		(value) =>
			value === '' ||
			/^https?:\/\/[^/]/.test(value) ||
			(value.startsWith('/') && !value.startsWith('//')),
		'Upload a file, or paste a full image URL'
	);

/** Accepts an ISO string or a Date and always yields a Date. */
export const dateSchema = z.union([z.iso.datetime({ offset: true }), z.date()]).pipe(z.coerce.date());

export const publishStatusSchema = z.enum(['draft', 'published']);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

export const userRoleSchema = z.enum(['admin', 'editor']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const sponsorTierSchema = z.enum(['platinum', 'gold', 'silver', 'community']);
export type SponsorTier = z.infer<typeof sponsorTierSchema>;
