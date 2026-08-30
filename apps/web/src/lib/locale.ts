import { page } from '$app/state';
import { extractLocaleFromUrl } from '$lib/paraglide/runtime';
import { BASE_LOCALE, type Locale } from '@awsug/shared';

/**
 * The locale of the page SvelteKit has navigated to.
 *
 * Prefer this to paraglide's `getLocale()` anywhere the value feeds a `$derived`
 * or a template. `getLocale()` reads `window.location.href` directly, which Svelte
 * cannot track, so a component holding it recomputes only when it is torn down and
 * rebuilt. That happens today because `{#key locale}` in the root layout remounts the
 * whole shell — but that key exists for the compiled message functions, and anything
 * relying on it for correctness breaks silently the day the key moves or a consumer
 * is rendered outside it. `page.url` is `$state`-backed, so reading it here is a real
 * dependency and the value follows the URL on its own.
 *
 * The server counterpart is `localeOf(url)` in `$lib/server/locale` — same rule on
 * both sides: the locale comes from the URL, never from ambient state.
 */
export function currentLocale(): Locale {
	return extractLocaleFromUrl(page.url) ?? BASE_LOCALE;
}
