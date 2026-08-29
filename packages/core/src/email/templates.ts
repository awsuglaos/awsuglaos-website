import { richTextToPlainText, type Locale, type RichTextDoc } from '@awsug/shared';
import {
	PALETTE,
	FONT_SANS,
	absoluteUrl,
	brandLogoAttachment,
	button,
	detailPanel,
	detailRow,
	escapeHtml,
	heading,
	layout,
	paragraph,
	ticketPanel
} from './layout.js';
import type { EmailAttachment, EmailMessage } from './types.js';

export const EVENT_TIME_ZONE = 'Asia/Vientiane';

export function formatEventDate(date: Date, locale: Locale): string {
	const tag = locale === 'lo' ? 'lo-LA' : 'en-GB';
	try {
		return new Intl.DateTimeFormat(tag, {
			dateStyle: 'full',
			timeStyle: 'short',
			timeZone: EVENT_TIME_ZONE
		}).format(date);
	} catch {
		// Node builds without full-icu fall back to English rather than throwing.
		return new Intl.DateTimeFormat('en-GB', {
			dateStyle: 'full',
			timeStyle: 'short',
			timeZone: EVENT_TIME_ZONE
		}).format(date);
	}
}

export { escapeHtml };

/**
 * The event blurb, as plain text rather than its rendered rich text.
 *
 * The stored description is organiser-authored HTML with headings, lists,
 * tables and images. Dropping that into an email means inheriting every layout
 * quirk those have across mail clients, on top of markup that was written for
 * a 68ch page column. Taking the text and setting it in the email's own type
 * is both safer and better looking; the full description is one tap away
 * behind the ticket link.
 */
function descriptionExcerpt(doc: RichTextDoc | null | undefined, limit = 280): string {
	const text = richTextToPlainText(doc).replace(/\s+/g, ' ').trim();
	if (text.length <= limit) return text;

	// Cut on a word boundary — a mid-word ellipsis reads like a bug.
	const cut = text.slice(0, limit);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* Registration confirmation                                                  */
/* -------------------------------------------------------------------------- */

interface RegistrationEmailParams {
	locale: Locale;
	/** Origin the header logo loads from — ctx.siteUrl at both call sites. */
	siteUrl: string;
	fullName: string;
	eventTitle: string;
	startAt: Date;
	locationName: string;
	ticketCode: string;
	ticketUrl: string;
	/** `events.coverImageUrl` — site-relative or absolute, both are handled. */
	coverImageUrl?: string | null;
	/** `eventTranslations.description`, shown as a short excerpt. */
	description?: RichTextDoc | null;
	/**
	 * The inline QR, from `renderTicketQr`. Absent means the encoder failed:
	 * the panel is dropped and the message degrades to the button alone rather
	 * than shipping a broken image.
	 */
	qr?: EmailAttachment;
}

const COPY = {
	lo: {
		subject: (title: string) => `ຢືນຢັນການລົງທະບຽນ — ${title}`,
		preheader: (title: string, when: string) => `${title} · ${when}`,
		heading: 'ການລົງທະບຽນຂອງທ່ານໄດ້ຮັບການຢືນຢັນແລ້ວ',
		greeting: (name: string) => `ສະບາຍດີ ${name},`,
		intro: (title: string) =>
			`ພວກເຮົາຮັບການລົງທະບຽນຂອງທ່ານສຳລັບ <strong>${title}</strong> ແລ້ວ. ລາຍລະອຽດຢູ່ລຸ່ມນີ້.`,
		when: 'ວັນທີ',
		where: 'ສະຖານທີ່',
		ticketLabel: 'ລະຫັດປີ້',
		qrCaption: 'ລະຫັດປີ້ຂອງທ່ານ',
		qrAlt: 'QR code ສຳລັບປີ້',
		scanNote:
			'ສະແດງ QR code ນີ້ຢູ່ປະຕູທາງເຂົ້າໃນມື້ງານ. ບັນທຶກອີເມວນີ້ໄວ້ ຫຼື ຖ່າຍໜ້າຈໍໄວ້ເພື່ອຄວາມສະດວກ.',
		cta: 'ເປີດປີ້ຂອງທ່ານ',
		closing: 'ພົບກັນໃນມື້ງານ,',
		signature: 'AWS User Group Laos'
	},
	en: {
		subject: (title: string) => `Registration confirmed — ${title}`,
		preheader: (title: string, when: string) => `${title} · ${when}`,
		heading: 'Your registration is confirmed',
		greeting: (name: string) => `Hello ${name},`,
		intro: (title: string) =>
			`We have your registration for <strong>${title}</strong>. The details are below.`,
		when: 'When',
		where: 'Where',
		ticketLabel: 'Ticket',
		qrCaption: 'Your ticket code',
		qrAlt: 'Ticket QR code for',
		scanNote:
			'Show this QR code at the door on the day. Keep this email, or take a screenshot so you have it offline.',
		cta: 'Open your ticket',
		closing: 'See you there,',
		signature: 'AWS User Group Laos'
	}
} as const;

export function registrationConfirmationEmail(
	params: RegistrationEmailParams
): Omit<EmailMessage, 'to'> {
	const t = COPY[params.locale === 'lo' ? 'lo' : 'en'];
	const when = formatEventDate(params.startAt, params.locale);
	const hasQr = Boolean(params.qr);
	const excerpt = descriptionExcerpt(params.description);

	const text = [
		t.greeting(params.fullName),
		'',
		params.locale === 'lo'
			? `ການລົງທະບຽນຂອງທ່ານສຳລັບ "${params.eventTitle}" ໄດ້ຮັບການຢືນຢັນແລ້ວ.`
			: `Your registration for "${params.eventTitle}" is confirmed.`,
		...(excerpt ? ['', excerpt] : []),
		'',
		`${t.when}: ${when}`,
		...(params.locationName ? [`${t.where}: ${params.locationName}`] : []),
		`${t.ticketLabel}: ${params.ticketCode}`,
		'',
		t.scanNote,
		params.ticketUrl,
		'',
		t.closing,
		t.signature
	].join('\n');

	const rows =
		detailRow(t.when, when) +
		(params.locationName ? detailRow(t.where, params.locationName) : '') +
		detailRow(t.ticketLabel, params.ticketCode, true);

	const body = [
		heading(escapeHtml(t.heading)),
		paragraph(escapeHtml(t.greeting(params.fullName)), 12),
		paragraph(t.intro(escapeHtml(params.eventTitle)), excerpt ? 20 : 28),
		// The organiser's own words, so the confirmation says what the reader
		// actually signed up for rather than only when and where it is.
		excerpt ? paragraph(escapeHtml(excerpt), 28) : '',
		detailPanel(rows),
		hasQr ? ticketPanel(params.ticketCode, t.qrCaption, t.qrAlt) : '',
		paragraph(escapeHtml(t.scanNote), 28),
		button(params.ticketUrl, t.cta),
		`<p style="margin:28px 0 0;font-family:${FONT_SANS};font-size:16px;line-height:1.8;color:${PALETTE.slate}">${escapeHtml(t.closing)}<br />${escapeHtml(t.signature)}</p>`
	].join('\n');

	return {
		subject: t.subject(params.eventTitle),
		text,
		html: layout({
			locale: params.locale,
			preheader: t.preheader(params.eventTitle, when),
			body,
			...(params.coverImageUrl
				? {
						cover: {
							url: absoluteUrl(params.coverImageUrl, params.siteUrl),
							alt: params.eventTitle
						}
					}
				: {})
		}),
		// The logo rides with every message; the QR only when it encoded.
		attachments: params.qr ? [brandLogoAttachment(), params.qr] : [brandLogoAttachment()]
	};
}

/* -------------------------------------------------------------------------- */
/* Newsletter welcome                                                         */
/* -------------------------------------------------------------------------- */

const NEWSLETTER_COPY = {
	lo: {
		subject: 'ຂອບໃຈທີ່ຕິດຕາມ AWS User Group Laos',
		preheader: 'ພວກເຮົາຈະສົ່ງຂ່າວງານ ແລະ ບົດຄວາມໃໝ່ໃຫ້ທ່ານ.',
		heading: 'ຂອບໃຈທີ່ຕິດຕາມພວກເຮົາ',
		intro: 'ທ່ານໄດ້ລົງທະບຽນຮັບຂ່າວສານຈາກ <strong>AWS User Group Laos</strong> ແລ້ວ.',
		detail: 'ພວກເຮົາຈະສົ່ງຂ່າວງານທີ່ຈະຈັດຂຶ້ນ ແລະ ບົດຄວາມໃໝ່ໃຫ້ທ່ານ — ບໍ່ຖີ່, ແລະ ບໍ່ມີສະແປມ.',
		cta: 'ເບິ່ງງານທີ່ຈະຈັດຂຶ້ນ',
		unsubscribe: 'ຍົກເລີກການຮັບຂ່າວ'
	},
	en: {
		subject: 'Thanks for subscribing to AWS User Group Laos',
		preheader: "We'll send you event announcements and new articles.",
		heading: 'Thanks for subscribing',
		intro: "You're on the list for <strong>AWS User Group Laos</strong>.",
		detail: "We'll send you upcoming events and new articles — infrequently, and never spam.",
		cta: 'See upcoming events',
		unsubscribe: 'Unsubscribe'
	}
} as const;

export function newsletterWelcomeEmail(
	locale: Locale,
	unsubscribeUrl: string,
	siteUrl: string
): Omit<EmailMessage, 'to'> {
	const t = NEWSLETTER_COPY[locale === 'lo' ? 'lo' : 'en'];
	const eventsUrl = `${siteUrl.replace(/\/+$/, '')}${locale === 'lo' ? '' : '/en'}/events`;

	const body = [
		heading(escapeHtml(t.heading)),
		paragraph(t.intro, 12),
		paragraph(escapeHtml(t.detail), 28),
		button(eventsUrl, t.cta)
	].join('\n');

	const footerExtra = `<p style="margin:0 0 6px;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${PALETTE.slate}"><a href="${escapeHtml(unsubscribeUrl)}" style="color:${PALETTE.slate};text-decoration:underline">${escapeHtml(t.unsubscribe)}</a></p>`;

	return {
		subject: t.subject,
		text: [
			t.heading,
			'',
			t.detail,
			'',
			`${t.cta}: ${eventsUrl}`,
			'',
			`${t.unsubscribe}: ${unsubscribeUrl}`
		].join('\n'),
		html: layout({
			locale,
			preheader: t.preheader,
			body,
			footerExtra
		}),
		attachments: [brandLogoAttachment()]
	};
}
