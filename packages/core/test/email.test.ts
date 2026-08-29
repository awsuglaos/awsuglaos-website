import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { describe, expect, it, vi } from 'vitest';
import { ConsoleEmailDispatcher, MemoryEmailDispatcher } from '../src/email/console.js';
import { absoluteUrl, BRAND_LOGO_CONTENT_ID } from '../src/email/layout.js';
import { renderTicketQr, TICKET_QR_CONTENT_ID } from '../src/email/qr.js';
import { ResendEmailDispatcher } from '../src/email/resend.js';
import { composeSender } from '../src/email/select.js';
import { SesEmailDispatcher } from '../src/email/ses.js';
import { newsletterWelcomeEmail, registrationConfirmationEmail } from '../src/email/templates.js';
import type { EmailAttachment, EmailMessage } from '../src/email/types.js';

const SITE_URL = 'https://awsug.la';

const BASE = {
	siteUrl: SITE_URL,
	fullName: 'Somsavath Phommachanh',
	eventTitle: 'AWS Community Day Vientiane 2026',
	startAt: new Date('2026-09-19T02:00:00Z'),
	locationName: 'Lane Xang Hotel, Vientiane',
	ticketCode: 'K7M4QP2X',
	ticketUrl: `${SITE_URL}/events/community-day-2026/ticket/K7M4QP2X`
} as const;

function doc(...paragraphs: string[]) {
	return {
		type: 'doc',
		content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
	};
}

const QR: EmailAttachment = {
	filename: 'ticket-K7M4QP2X.png',
	content: new Uint8Array([137, 80, 78, 71]),
	contentType: 'image/png',
	contentId: TICKET_QR_CONTENT_ID
};

describe('composeSender', () => {
	it('builds the display-name form the providers expect', () => {
		expect(composeSender('AWS User Group Laos', 'noreply@awsug.la')).toBe(
			'AWS User Group Laos <noreply@awsug.la>'
		);
	});

	it('falls back to the bare address when no name is configured', () => {
		expect(composeSender(undefined, 'noreply@awsug.la')).toBe('noreply@awsug.la');
		expect(composeSender('   ', 'noreply@awsug.la')).toBe('noreply@awsug.la');
	});

	it('quotes a name that would otherwise break the header', () => {
		// A comma is a recipient separator: unquoted, this would be two addresses.
		expect(composeSender('AWS UG, Laos', 'noreply@awsug.la')).toBe(
			'"AWS UG, Laos" <noreply@awsug.la>'
		);
	});
});

describe('registrationConfirmationEmail', () => {
	for (const locale of ['lo', 'en'] as const) {
		describe(locale, () => {
			const message = registrationConfirmationEmail({ locale, ...BASE, qr: QR });

			it('carries the ticket code and URL in both parts', () => {
				for (const part of [message.html, message.text]) {
					expect(part).toContain(BASE.ticketCode);
					expect(part).toContain(BASE.ticketUrl);
				}
			});

			it('names the event in the subject', () => {
				expect(message.subject).toContain(BASE.eventTitle);
			});

			it('references the inline QR and ships the attachment that backs it', () => {
				expect(message.html).toContain(`src="cid:${TICKET_QR_CONTENT_ID}"`);
				expect(message.attachments?.map((a) => a.contentId)).toContain(TICKET_QR_CONTENT_ID);
			});

			it('keeps the ticket code in the QR alt text', () => {
				// A client that strips inline images must still leave the reader the
				// code — it is the only thing that gets them through the door.
				const alt = /<img[^>]*src="cid:ticket-qr"[^>]*alt="([^"]*)"/.exec(message.html)?.[1];
				expect(alt).toContain(BASE.ticketCode);
			});

			it('uses the brand violet, not AWS orange', () => {
				expect(message.html).toContain('#8c52ff');
				expect(message.html).not.toContain('#ff9900');
			});

		});
	}

	it('drops the QR panel entirely when the encoder failed', () => {
		const message = registrationConfirmationEmail({ locale: 'en', ...BASE });
		expect(message.html).not.toContain(`cid:${TICKET_QR_CONTENT_ID}`);
		// The logo still ships; only the QR is gone.
		expect(message.attachments?.map((a) => a.contentId)).toEqual([BRAND_LOGO_CONTENT_ID]);
		// The link is what the reader falls back to, so it must still be there.
		expect(message.html).toContain(BASE.ticketUrl);
	});

	it('always attaches the brand logo and references it inline', () => {
		// A remote logo is blocked by default in a good share of clients, and
		// resolves against nothing when the site is not publicly reachable —
		// which is exactly how the first real send arrived with a broken image.
		const message = registrationConfirmationEmail({ locale: 'en', ...BASE, qr: QR });
		expect(message.html).toContain(`src="cid:${BRAND_LOGO_CONTENT_ID}"`);
		expect(message.html).not.toContain('email-logo.png');
		const logo = message.attachments?.find((a) => a.contentId === BRAND_LOGO_CONTENT_ID);
		expect(logo?.contentType).toBe('image/png');
		expect(logo?.content.byteLength).toBeGreaterThan(1000);
	});

	it('absolutises a site-relative cover image', () => {
		// Uploads are stored site-relative; a bare /uploads/… src in an email
		// resolves against nothing and renders as a broken image.
		const message = registrationConfirmationEmail({
			locale: 'en',
			...BASE,
			coverImageUrl: '/uploads/events/cover.jpg'
		});
		expect(message.html).toContain(`src="${SITE_URL}/uploads/events/cover.jpg"`);
	});

	it('leaves an already-absolute cover image alone', () => {
		const message = registrationConfirmationEmail({
			locale: 'en',
			...BASE,
			coverImageUrl: 'https://cdn.example.com/cover.jpg'
		});
		expect(message.html).toContain('src="https://cdn.example.com/cover.jpg"');
	});

	it('renders no cover row when the event has no cover', () => {
		const message = registrationConfirmationEmail({ locale: 'en', ...BASE, coverImageUrl: null });
		expect(message.html).not.toContain('<img src="http');
	});

	it("carries the organiser's description in both parts", () => {
		const message = registrationConfirmationEmail({
			locale: 'en',
			...BASE,
			description: doc('A full day of talks and demos.', 'Sessions run in Lao and English.')
		});
		expect(message.html).toContain('A full day of talks and demos.');
		expect(message.text).toContain('A full day of talks and demos.');
	});

	it('truncates a long description on a word boundary', () => {
		const message = registrationConfirmationEmail({
			locale: 'en',
			...BASE,
			description: doc(`${'word '.repeat(200)}end`)
		});
		const excerpt = /word word[^<]*…/.exec(message.html)?.[0] ?? '';
		expect(excerpt.length).toBeLessThan(300);
		expect(excerpt).toMatch(/word…$/);
	});

	it('adds nothing when the description is empty', () => {
		const message = registrationConfirmationEmail({ locale: 'en', ...BASE, description: null });
		expect(message.html).not.toContain('…');
	});

	it('escapes a name that contains markup', () => {
		const message = registrationConfirmationEmail({
			locale: 'en',
			...BASE,
			fullName: '<script>alert(1)</script>'
		});
		expect(message.html).not.toContain('<script>');
		expect(message.html).toContain('&lt;script&gt;');
	});

	it('omits the location row when the event has no venue name', () => {
		const message = registrationConfirmationEmail({ locale: 'en', ...BASE, locationName: '' });
		expect(message.html).not.toContain('>Where<');
		expect(message.text).not.toContain('Where:');
	});

	it('writes the date in the event time zone, not the server one', () => {
		const message = registrationConfirmationEmail({ locale: 'en', ...BASE });
		// 02:00 UTC is 09:00 in Vientiane; a UTC render would say 02:00.
		expect(message.text).toContain('09:00');
	});
});

describe('newsletterWelcomeEmail', () => {
	for (const locale of ['lo', 'en'] as const) {
		it(`carries the unsubscribe link in both parts (${locale})`, () => {
			const url = `${SITE_URL}/newsletter/unsubscribe?token=abc`;
			const message = newsletterWelcomeEmail(locale, url, SITE_URL);
			expect(message.html).toContain(url);
			expect(message.text).toContain(url);
			expect(message.subject.length).toBeGreaterThan(0);
		});
	}

	it('points Lao readers at the unprefixed events page and English at /en', () => {
		expect(newsletterWelcomeEmail('lo', 'u', SITE_URL).html).toContain(`${SITE_URL}/events`);
		expect(newsletterWelcomeEmail('en', 'u', SITE_URL).html).toContain(`${SITE_URL}/en/events`);
	});

	it('tolerates a site URL with a trailing slash', () => {
		const message = newsletterWelcomeEmail('en', 'u', 'https://awsug.la/');
		expect(message.html).not.toContain('awsug.la//');
	});

	it('ships the brand logo too', () => {
		const message = newsletterWelcomeEmail('en', 'u', SITE_URL);
		expect(message.html).toContain(`src="cid:${BRAND_LOGO_CONTENT_ID}"`);
		expect(message.attachments?.[0]?.contentId).toBe(BRAND_LOGO_CONTENT_ID);
	});
});

describe('absoluteUrl', () => {
	it('leaves http and https alone and joins everything else to the site', () => {
		expect(absoluteUrl('https://a.test/x.png', SITE_URL)).toBe('https://a.test/x.png');
		expect(absoluteUrl('http://a.test/x.png', SITE_URL)).toBe('http://a.test/x.png');
		expect(absoluteUrl('/uploads/x.png', SITE_URL)).toBe(`${SITE_URL}/uploads/x.png`);
		expect(absoluteUrl('uploads/x.png', SITE_URL)).toBe(`${SITE_URL}/uploads/x.png`);
		expect(absoluteUrl('/uploads/x.png', `${SITE_URL}/`)).toBe(`${SITE_URL}/uploads/x.png`);
	});
});

describe('renderTicketQr', () => {
	it('produces a PNG tagged for inline reference', async () => {
		const attachment = await renderTicketQr('K7M4QP2X');
		expect(attachment.contentType).toBe('image/png');
		expect(attachment.contentId).toBe(TICKET_QR_CONTENT_ID);
		// PNG magic number — proof it is an image and not an SVG string.
		expect(Array.from(attachment.content.subarray(0, 4))).toEqual([137, 80, 78, 71]);
	});
});

describe('ResendEmailDispatcher', () => {
	function fakeResend(result: { data?: unknown; error?: unknown }) {
		const send = vi.fn().mockResolvedValue(result);
		return { client: { emails: { send } } as never, send };
	}

	const message: EmailMessage = {
		to: 'attendee@example.com',
		subject: 'Registration confirmed',
		html: '<p>hi</p>',
		text: 'hi',
		attachments: [QR]
	};

	it('sends with the composed sender and an inline attachment', async () => {
		const { client, send } = fakeResend({ data: { id: 'abc' } });
		const from = composeSender('AWS User Group Laos', 'noreply@awsug.la');
		await new ResendEmailDispatcher({ apiKey: 'k', from }, client).send(message);

		const payload = send.mock.calls[0]?.[0];
		expect(payload.from).toBe(from);
		expect(payload.to).toEqual(['attendee@example.com']);
		expect(payload.attachments[0].contentId).toBe(TICKET_QR_CONTENT_ID);
		expect(Buffer.isBuffer(payload.attachments[0].content)).toBe(true);
	});

	it('omits attachments entirely when there are none', async () => {
		const { client, send } = fakeResend({ data: { id: 'abc' } });
		const { attachments: _drop, ...plain } = message;
		await new ResendEmailDispatcher({ apiKey: 'k', from: 'a@b.c' }, client).send(plain);
		expect(send.mock.calls[0]?.[0]).not.toHaveProperty('attachments');
	});

	it('throws on a rejected send rather than reporting success', async () => {
		// The SDK returns failures in the response body. Left unchecked, a
		// rejected send is indistinguishable from a delivered one.
		const { client } = fakeResend({ error: { name: 'validation_error', message: 'bad from' } });
		await expect(
			new ResendEmailDispatcher({ apiKey: 'k', from: 'a@b.c' }, client).send(message)
		).rejects.toThrow(/bad from/);
	});
});

describe('SesEmailDispatcher', () => {
	function fakeSes() {
		const send = vi.fn().mockResolvedValue({});
		return { client: { send } as never, send };
	}

	const plain: EmailMessage = {
		to: 'attendee@example.com',
		subject: 'Registration confirmed',
		html: '<p>hi</p>',
		text: 'hi'
	};

	it('leaves the no-attachment command exactly as it was', async () => {
		const { client, send } = fakeSes();
		await new SesEmailDispatcher({ from: 'a@b.c' }, client).send(plain);

		const input = (send.mock.calls[0]?.[0] as SendEmailCommand).input;
		expect(input.Content?.Simple).not.toHaveProperty('Attachments');
		expect(input.Content?.Simple?.Subject?.Data).toBe(plain.subject);
	});

	it('declares an attachment with a content id as INLINE', async () => {
		const { client, send } = fakeSes();
		await new SesEmailDispatcher({ from: 'a@b.c' }, client).send({ ...plain, attachments: [QR] });

		const attachment = (send.mock.calls[0]?.[0] as SendEmailCommand).input.Content?.Simple
			?.Attachments?.[0];
		expect(attachment?.ContentId).toBe(TICKET_QR_CONTENT_ID);
		expect(attachment?.ContentDisposition).toBe('INLINE');
		expect(attachment?.ContentType).toBe('image/png');
	});

	it('declares an attachment without a content id as a normal ATTACHMENT', async () => {
		const { client, send } = fakeSes();
		const { contentId: _drop, ...file } = QR;
		await new SesEmailDispatcher({ from: 'a@b.c' }, client).send({ ...plain, attachments: [file] });

		const attachment = (send.mock.calls[0]?.[0] as SendEmailCommand).input.Content?.Simple
			?.Attachments?.[0];
		expect(attachment?.ContentDisposition).toBe('ATTACHMENT');
		expect(attachment?.ContentId).toBeUndefined();
	});
});

describe('local dispatchers', () => {
	it('records attachments so tests can assert on them', async () => {
		const memory = new MemoryEmailDispatcher();
		await memory.send({ to: 'a@b.c', subject: 's', html: 'h', text: 't', attachments: [QR] });
		expect(memory.sent[0]?.attachments?.[0]?.filename).toBe(QR.filename);
	});

	it('names attached files in the console output', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		await new ConsoleEmailDispatcher().send({
			to: 'a@b.c',
			subject: 's',
			html: 'h',
			text: 't',
			attachments: [QR]
		});
		expect(log.mock.calls[0]?.[0]).toContain(QR.filename);
		log.mockRestore();
	});
});
