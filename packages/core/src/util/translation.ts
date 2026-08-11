import { BASE_LOCALE, type Locale } from '@awsug/shared';

/**
 * Picks the requested locale, falling back to the base locale and then to
 * whatever exists. Content is often written in Lao first and translated later,
 * so an English visitor must still see something rather than a blank page.
 */
export function pickTranslation<T extends { locale: Locale }>(
	translations: readonly T[],
	locale: Locale
): T | undefined {
	return (
		translations.find((t) => t.locale === locale) ??
		translations.find((t) => t.locale === BASE_LOCALE) ??
		translations[0]
	);
}

/** True when the requested locale is missing and the caller is seeing a fallback. */
export function isFallback<T extends { locale: Locale }>(
	translations: readonly T[],
	locale: Locale
): boolean {
	return !translations.some((t) => t.locale === locale);
}
