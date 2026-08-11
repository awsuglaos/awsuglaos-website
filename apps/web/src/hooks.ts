import type { Reroute } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

/**
 * Maps a localized URL back to the single set of route files. `/en/events` and
 * `/events` both resolve to `src/routes/events`, so there is one route tree
 * rather than one per language.
 */
export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;
