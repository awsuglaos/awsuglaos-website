import { describe, expect, it } from 'vitest';
import {
	MAX_DOCUMENT_BYTES,
	MAX_IMAGE_BYTES,
	extensionFor,
	presignUploadInputSchema
} from './upload.js';

const parse = (input: unknown) => presignUploadInputSchema.safeParse(input);

describe('presignUploadInputSchema', () => {
	/*
	 * The uploads bucket is served from the site's own origin, so a file that can
	 * execute script runs *as the site* and can read an admin's session cookie.
	 * These assertions are the guard. Widening the allowlist to include any of
	 * them means deleting a failing test, which is the point — it should not be
	 * possible to do by accident.
	 */
	it.each(['text/html', 'image/svg+xml', 'application/xml', 'text/xml', 'application/javascript'])(
		'refuses %s for both purposes',
		(contentType) => {
			expect(parse({ contentType, contentLength: 1024, purpose: 'image' }).success).toBe(false);
			expect(parse({ contentType, contentLength: 1024, purpose: 'document' }).success).toBe(false);
		}
	);

	it('defaults to the image rules when no purpose is given', () => {
		// Absent `purpose` must land on the stricter allowlist, never the looser
		// one — a request that forgets the field should not gain document rights.
		expect(parse({ contentType: 'image/png', contentLength: 1024 }).success).toBe(true);
		expect(parse({ contentType: 'application/pdf', contentLength: 1024 }).success).toBe(false);
	});

	it('accepts documents only under the document purpose', () => {
		expect(
			parse({ contentType: 'application/pdf', contentLength: 1024, purpose: 'document' }).success
		).toBe(true);
		expect(
			parse({ contentType: 'application/zip', contentLength: 1024, purpose: 'document' }).success
		).toBe(true);
	});

	it('keeps the two allowlists disjoint', () => {
		// An image sent as a 'document' is refused, and vice versa. Gallery photos
		// upload as images and get the 8MB rules; event resources upload as
		// documents. Letting either purpose accept the other's types would quietly
		// hand images the 50MB ceiling.
		expect(
			parse({ contentType: 'image/png', contentLength: 1024, purpose: 'document' }).success
		).toBe(false);
		expect(
			parse({ contentType: 'application/pdf', contentLength: 1024, purpose: 'image' }).success
		).toBe(false);
	});

	it('applies the ceiling that matches the purpose', () => {
		expect(parse({ contentType: 'image/png', contentLength: MAX_IMAGE_BYTES }).success).toBe(true);
		expect(parse({ contentType: 'image/png', contentLength: MAX_IMAGE_BYTES + 1 }).success).toBe(
			false
		);

		const doc = (contentLength: number) =>
			parse({ contentType: 'application/pdf', contentLength, purpose: 'document' }).success;
		expect(doc(MAX_DOCUMENT_BYTES)).toBe(true);
		expect(doc(MAX_DOCUMENT_BYTES + 1)).toBe(false);
	});

	it('rejects an empty file', () => {
		expect(parse({ contentType: 'image/png', contentLength: 0 }).success).toBe(false);
	});
});

describe('extensionFor', () => {
	it('names the document types so keys keep a usable extension', () => {
		expect(extensionFor('application/pdf')).toBe('pdf');
		expect(
			extensionFor('application/vnd.openxmlformats-officedocument.presentationml.presentation')
		).toBe('pptx');
		expect(extensionFor('application/zip')).toBe('zip');
	});

	it('falls back to bin for anything unknown', () => {
		expect(extensionFor('application/x-made-up')).toBe('bin');
	});
});
