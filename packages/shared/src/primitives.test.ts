import { describe, expect, it } from 'vitest';
import { emailSchema, imageUrlSchema, phoneSchema, slugSchema } from './primitives.js';
import { generateTicketCode, generateUnsubscribeToken } from './ticket.js';
import { buildAnswersSchema, DEFAULT_FORM_BLOCKS } from './schemas/form.js';

describe('phoneSchema', () => {
	it('normalises a Lao domestic number to E.164', () => {
		expect(phoneSchema.parse('020 55512345')).toBe('+8562055512345');
		expect(phoneSchema.parse('02055512345')).toBe('+8562055512345');
		expect(phoneSchema.parse('030-123-4567')).toBe('+856301234567');
	});

	it('keeps an international number as given', () => {
		expect(phoneSchema.parse('+66 81 234 5678')).toBe('+66812345678');
		expect(phoneSchema.parse('+1 (555) 010-9999')).toBe('+15550109999');
	});

	it('adds the plus to a bare international number', () => {
		expect(phoneSchema.parse('856 20 55512345')).toBe('+8562055512345');
	});

	it('rejects values that are not phone numbers', () => {
		for (const bad of ['', 'not a phone', '12', '+'.repeat(3), '0123456789012345678']) {
			expect(phoneSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe('emailSchema', () => {
	it('trims and lower-cases, so duplicates collapse', () => {
		expect(emailSchema.parse('  Someone@Example.LA ')).toBe('someone@example.la');
	});

	it('rejects malformed addresses', () => {
		for (const bad of ['nope', 'a@', '@b.la', 'a b@c.la']) {
			expect(emailSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe('slugSchema', () => {
	it('accepts lowercase hyphenated slugs', () => {
		expect(slugSchema.parse('aws-community-day-2026')).toBe('aws-community-day-2026');
	});

	it('rejects anything that would not survive a URL', () => {
		for (const bad of ['Has Spaces', 'UPPER', 'trailing-', '-leading', 'double--hyphen', 'ລາວ']) {
			expect(slugSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe('imageUrlSchema', () => {
	it('accepts the site-relative paths uploads produce', () => {
		expect(imageUrlSchema.parse('/uploads/2026/08/01KZND3XHEP4Y558WQNC16GM4A.png')).toBe(
			'/uploads/2026/08/01KZND3XHEP4Y558WQNC16GM4A.png'
		);
	});

	it('accepts an absolute URL for an image hosted elsewhere', () => {
		expect(imageUrlSchema.parse('https://example.la/logo.png')).toBe('https://example.la/logo.png');
	});

	it('accepts empty, so an optional image can be cleared', () => {
		expect(imageUrlSchema.parse('')).toBe('');
	});

	it('rejects a protocol-relative URL, which only looks relative', () => {
		// //evil.example/x.png would load from another host entirely.
		expect(imageUrlSchema.safeParse('//evil.example/x.png').success).toBe(false);
	});

	it('rejects other schemes', () => {
		for (const bad of ['javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'ftp://x/y.png']) {
			expect(imageUrlSchema.safeParse(bad).success, bad).toBe(false);
		}
	});
});

/*
 * The default form is what every event starts with and what every event that
 * predates the builder was backfilled to, so it is worth holding to the same
 * guarantees the old fixed schema gave.
 */
describe('the default registration form', () => {
	const schema = buildAnswersSchema(DEFAULT_FORM_BLOCKS);

	it('accepts a minimal registration', () => {
		const result = schema.parse({
			fullName: 'Somchai Vongphachanh',
			email: 'somchai@example.la'
		});

		expect(result.phone).toBeNull();
		expect(result.organisation).toBeNull();
	});

	it('normalises the email and the phone number on the way in', () => {
		const result = schema.parse({
			fullName: 'Somchai Vongphachanh',
			email: '  Somchai@Example.LA ',
			phone: '020 55512345'
		});

		expect(result.email).toBe('somchai@example.la');
		expect(result.phone).toBe('+8562055512345');
	});

	it('requires a name and an email address', () => {
		expect(schema.safeParse({ email: 'a@example.la' }).success).toBe(false);
		expect(schema.safeParse({ fullName: 'Somchai' }).success).toBe(false);
	});
});

describe('ticket codes', () => {
	it('produces a 26-character Crockford base32 ULID', () => {
		const code = generateTicketCode();
		expect(code).toHaveLength(26);
		expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
	});

	it('does not repeat', () => {
		const codes = new Set(Array.from({ length: 500 }, generateTicketCode));
		expect(codes.size).toBe(500);
	});

	it('sorts by issue time at millisecond granularity', async () => {
		const first = generateTicketCode();
		// ULIDs minted inside the same millisecond share a timestamp prefix and
		// differ only in their random tail, so ordering is guaranteed *between*
		// milliseconds, not within one.
		await new Promise((resolve) => setTimeout(resolve, 3));
		const later = generateTicketCode();
		expect(later > first).toBe(true);
	});

	it('generates distinct unsubscribe tokens of a bounded length', () => {
		const token = generateUnsubscribeToken();
		expect(token.length).toBeLessThanOrEqual(48);
		expect(new Set(Array.from({ length: 200 }, generateUnsubscribeToken)).size).toBe(200);
	});
});
