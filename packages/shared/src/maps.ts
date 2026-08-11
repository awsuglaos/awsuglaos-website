import { z } from 'zod';

/**
 * Everything that understands a Google Maps URL lives here.
 *
 * The public site embeds maps with the keyless `?output=embed` form. That is an
 * undocumented Google behaviour, not a supported API — it works today and needs
 * no API key or billing account, but it can stop working without notice. Keeping
 * every piece of URL handling in this one module means switching to the official
 * Maps Embed API (which requires a key) is a change to `buildEmbedUrl` alone.
 */

const MAPS_HOSTS = new Set([
	'google.com',
	'www.google.com',
	'maps.google.com',
	'maps.app.goo.gl',
	'goo.gl',
	'g.co'
]);

/** Short links carry no coordinates until a redirect is followed. */
const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

export function isGoogleMapsUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

	const host = url.hostname.toLowerCase();
	if (MAPS_HOSTS.has(host)) return true;

	// Country domains: google.co.th, google.la, google.co.uk …
	return /^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
}

export function isShortMapsLink(value: string): boolean {
	try {
		return SHORT_LINK_HOSTS.has(new URL(value).hostname.toLowerCase());
	} catch {
		return false;
	}
}

export const googleMapsUrlSchema = z
	.string()
	.trim()
	.min(1, 'A Google Maps link is required')
	.max(2048)
	.refine(isGoogleMapsUrl, 'Paste a Google Maps link (google.com/maps or maps.app.goo.gl)');

export interface Coordinates {
	lat: number;
	lng: number;
}

function validCoords(lat: number, lng: number): Coordinates | null {
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
	return { lat, lng };
}

function parsePair(value: string | null): Coordinates | null {
	if (!value) return null;
	const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
	if (!match) return null;
	return validCoords(Number(match[1]), Number(match[2]));
}

/**
 * Pulls coordinates out of a Google Maps URL, most precise source first.
 *
 * `!3d…!4d…` inside the `data` parameter is the actual pin. `@lat,lng` is only
 * the map viewport centre, which for a large venue can sit a street away — so it
 * is the last resort, not the first.
 */
export function extractCoordinates(value: string): Coordinates | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}

	const pin = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
	if (pin) {
		const coords = validCoords(Number(pin[1]), Number(pin[2]));
		if (coords) return coords;
	}

	for (const param of ['q', 'query', 'll', 'center', 'destination']) {
		const coords = parsePair(url.searchParams.get(param));
		if (coords) return coords;
	}

	const viewport = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
	if (viewport) {
		const coords = validCoords(Number(viewport[1]), Number(viewport[2]));
		if (coords) return coords;
	}

	return null;
}

/**
 * Recovers a human place name from a maps URL when there are no coordinates —
 * e.g. ".../maps/place/National+Convention+Centre/..." → the venue name.
 */
export function extractPlaceQuery(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}

	for (const param of ['q', 'query']) {
		const raw = url.searchParams.get(param);
		if (raw && !parsePair(raw)) return raw;
	}

	const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
	if (place?.[1]) {
		try {
			return decodeURIComponent(place[1].replace(/\+/g, ' '));
		} catch {
			return place[1].replace(/\+/g, ' ');
		}
	}

	return null;
}

export interface EmbedSource {
	/** Coordinates parsed at save time, if the link carried any. */
	coordinates?: Coordinates | null;
	/** The original Google Maps link. */
	locationUrl?: string | null;
	/** The translated venue name, used when nothing better is available. */
	locationName?: string | null;
}

/**
 * Builds the iframe `src` for the venue map, or null when there is nothing to
 * show. Coordinates win because they are unambiguous; a place name is a search
 * and can land on the wrong branch of a chain.
 */
export function buildEmbedUrl(source: EmbedSource): string | null {
	const query = embedQuery(source);
	if (!query) return null;

	const params = new URLSearchParams({ q: query, z: '16', output: 'embed' });
	return `https://www.google.com/maps?${params.toString()}`;
}

function embedQuery(source: EmbedSource): string | null {
	if (source.coordinates) {
		return `${source.coordinates.lat},${source.coordinates.lng}`;
	}

	if (source.locationUrl) {
		const coords = extractCoordinates(source.locationUrl);
		if (coords) return `${coords.lat},${coords.lng}`;

		const place = extractPlaceQuery(source.locationUrl);
		if (place) return place;
	}

	return source.locationName?.trim() || null;
}
