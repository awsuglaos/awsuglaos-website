import { extractCoordinates, isShortMapsLink, type Coordinates } from '@awsug/shared';

export interface ResolvedLocation {
	/** The stored link — expanded if the input was a short link. */
	locationUrl: string;
	coordinates: Coordinates | null;
}

/**
 * Expands a `maps.app.goo.gl` link and pulls coordinates out of the result.
 *
 * Short links carry no coordinates at all: the pin only exists in the expanded
 * URL, so without following the redirect the map falls back to a text search
 * and can land on the wrong branch of a chain. This runs once when an event is
 * saved, never on render — a map on a public page must not depend on a
 * round-trip to Google.
 *
 * Failure is non-fatal. A network blip should not stop an organiser saving an
 * event; the original link is kept and the map degrades to a name search.
 */
export async function resolveLocation(
	locationUrl: string,
	fetchFn: typeof fetch = fetch,
	timeoutMs = 4000
): Promise<ResolvedLocation> {
	let resolved = locationUrl;

	if (isShortMapsLink(locationUrl)) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetchFn(locationUrl, {
				method: 'GET',
				redirect: 'follow',
				signal: controller.signal
			});
			if (response.url) resolved = response.url;
		} catch (error) {
			console.warn('Could not expand Google Maps short link; keeping the original', {
				locationUrl,
				error: error instanceof Error ? error.message : String(error)
			});
		} finally {
			clearTimeout(timer);
		}
	}

	return { locationUrl: resolved, coordinates: extractCoordinates(resolved) };
}
