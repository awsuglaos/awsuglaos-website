import { z } from 'zod';

/**
 * Lao is the base locale — it renders unprefixed at `/`, with English at `/en/*`.
 * Flip `BASE_LOCALE` (and the Paraglide config in apps/web/vite.config.ts) to
 * invert that if the group decides to lead with English.
 */
export const LOCALES = ['lo', 'en'] as const;
export const BASE_LOCALE = 'lo' satisfies Locale;

export const localeSchema = z.enum(LOCALES);
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
	lo: 'ລາວ',
	en: 'English'
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
