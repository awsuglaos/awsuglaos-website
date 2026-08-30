import { extractLocaleFromUrl } from '$lib/paraglide/runtime';
import { BASE_LOCALE, type Locale } from '@awsug/shared';

/**
 * The locale a server `load` should render, read from the URL it was called for.
 *
 * Use this in `load`, never `getLocale()`. Paraglide resolves `getLocale()` through
 * AsyncLocalStorage, which SvelteKit's dependency tracker cannot see — and `hooks.ts`
 * reroutes `/en/events` onto the same route as `/events` with the same params, so the
 * URL is the *only* thing that differs between the two languages. A load that reads
 * the locale ambiently therefore declares no dependency on it: SvelteKit judges the
 * node still valid on a client-side language switch, skips the `__data.json` request
 * entirely, and re-renders the previous language's rows. Touching `url` is not
 * incidental here — it *is* the declaration that makes the load re-run.
 *
 * Paraglide's own `getLocaleForUrl()` is not a substitute: its url branch is guarded
 * by `!isServer`, so inside a `+page.server.ts` it ignores the URL and falls through
 * to the cookie and then the base locale.
 *
 * It also keeps the locale a pure function of the URL, which is what the
 * `cache-control: public` headers on these routes quietly assume: the CloudFront cache
 * key and the language of the response then have one common cause, so no `Vary` is
 * needed and no reordering of the paraglide strategy list can poison a cached page.
 */
export function localeOf(url: URL): Locale {
	return extractLocaleFromUrl(url) ?? BASE_LOCALE;
}
