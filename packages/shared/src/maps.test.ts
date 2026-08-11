import { describe, expect, it } from 'vitest';
import {
	buildEmbedUrl,
	extractCoordinates,
	extractPlaceQuery,
	googleMapsUrlSchema,
	isGoogleMapsUrl,
	isShortMapsLink
} from './maps.js';

describe('isGoogleMapsUrl', () => {
	it('accepts the forms people actually paste', () => {
		for (const url of [
			'https://www.google.com/maps/place/Lao+National+Convention+Centre/@17.9435,102.6331,17z',
			'https://www.google.com/maps?q=17.9757,102.6331',
			'https://maps.google.com/?q=Toh-Lao+Coworking',
			'https://maps.app.goo.gl/abc123',
			'https://goo.gl/maps/xyz789',
			'https://www.google.co.th/maps/place/Bangkok'
		]) {
			expect(isGoogleMapsUrl(url), url).toBe(true);
		}
	});

	it('rejects anything that is not Google Maps', () => {
		for (const url of [
			'https://openstreetmap.org/#map=17/17.97/102.63',
			'https://evil.example/google.com/maps',
			'javascript:alert(1)',
			'not a url',
			''
		]) {
			expect(isGoogleMapsUrl(url), url).toBe(false);
		}
	});

	it('is not fooled by a lookalike hostname', () => {
		// The check must be on the host, not a substring of the whole URL.
		expect(isGoogleMapsUrl('https://google.com.evil.example/maps?q=1,2')).toBe(false);
	});

	it('powers the schema used by the event form', () => {
		expect(googleMapsUrlSchema.safeParse('https://maps.app.goo.gl/abc').success).toBe(true);
		expect(googleMapsUrlSchema.safeParse('https://example.la/venue').success).toBe(false);
		expect(googleMapsUrlSchema.safeParse('').success).toBe(false);
	});
});

describe('isShortMapsLink', () => {
	it('identifies links that need a redirect to resolve', () => {
		expect(isShortMapsLink('https://maps.app.goo.gl/abc123')).toBe(true);
		expect(isShortMapsLink('https://goo.gl/maps/xyz')).toBe(true);
		expect(isShortMapsLink('https://www.google.com/maps?q=1,2')).toBe(false);
	});
});

describe('extractCoordinates', () => {
	it('prefers the pin in the data parameter over the viewport centre', () => {
		// !3d/!4d is the actual place; @lat,lng is only where the map was centred,
		// which for a large venue can be a street away.
		const url =
			'https://www.google.com/maps/place/Somewhere/@17.9000,102.6000,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d17.9435!4d102.6331';
		expect(extractCoordinates(url)).toEqual({ lat: 17.9435, lng: 102.6331 });
	});

	it('reads coordinates from a query parameter', () => {
		expect(extractCoordinates('https://www.google.com/maps?q=17.9757,102.6331')).toEqual({
			lat: 17.9757,
			lng: 102.6331
		});
		expect(
			extractCoordinates('https://www.google.com/maps/search/?api=1&query=-17.5%2C102.1')
		).toEqual({ lat: -17.5, lng: 102.1 });
	});

	it('falls back to the viewport centre', () => {
		expect(extractCoordinates('https://www.google.com/maps/@17.9757,102.6331,15z')).toEqual({
			lat: 17.9757,
			lng: 102.6331
		});
	});

	it('returns null when there are no coordinates', () => {
		expect(extractCoordinates('https://www.google.com/maps/place/Some+Venue')).toBeNull();
		expect(extractCoordinates('https://maps.app.goo.gl/abc123')).toBeNull();
		expect(extractCoordinates('nonsense')).toBeNull();
	});

	it('rejects out-of-range values rather than trusting them', () => {
		expect(extractCoordinates('https://www.google.com/maps?q=999,102.6')).toBeNull();
		expect(extractCoordinates('https://www.google.com/maps?q=17.9,-999')).toBeNull();
	});
});

describe('extractPlaceQuery', () => {
	it('recovers a venue name from a place URL', () => {
		expect(
			extractPlaceQuery('https://www.google.com/maps/place/Lao+National+Convention+Centre/@1,2,17z')
		).toBe('Lao National Convention Centre');
	});

	it('reads a text query parameter but not a coordinate one', () => {
		expect(extractPlaceQuery('https://maps.google.com/?q=Toh-Lao+Coworking')).toBe(
			'Toh-Lao Coworking'
		);
		expect(extractPlaceQuery('https://www.google.com/maps?q=17.9,102.6')).toBeNull();
	});
});

describe('buildEmbedUrl', () => {
	it('uses stored coordinates when present', () => {
		const url = buildEmbedUrl({
			coordinates: { lat: 17.9435, lng: 102.6331 },
			locationName: 'Ignored'
		});
		expect(url).toContain('q=17.9435%2C102.6331');
		expect(url).toContain('output=embed');
	});

	it('parses the link when coordinates were not stored', () => {
		const url = buildEmbedUrl({
			locationUrl: 'https://www.google.com/maps?q=17.9757,102.6331'
		});
		expect(url).toContain('q=17.9757%2C102.6331');
	});

	it('falls back to a place name, then to the venue name', () => {
		expect(
			buildEmbedUrl({ locationUrl: 'https://www.google.com/maps/place/Toh-Lao+Coworking' })
		).toContain('Toh-Lao+Coworking');

		expect(buildEmbedUrl({ locationName: 'ຫໍປະຊຸມແຫ່ງຊາດ' })).toContain('output=embed');
	});

	it('returns null when there is nothing to show', () => {
		expect(buildEmbedUrl({})).toBeNull();
		expect(buildEmbedUrl({ locationName: '   ' })).toBeNull();
	});

	it('encodes the query so a venue name cannot break out of the URL', () => {
		const url = buildEmbedUrl({ locationName: 'A & B "venue" <script>' });
		expect(url).not.toContain('<script>');
		expect(url).not.toContain(' ');
	});
});
