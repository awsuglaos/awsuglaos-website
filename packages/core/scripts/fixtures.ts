import type { Locale, RichTextDoc } from '@awsug/shared';
import { renderTicketQr } from '../src/email/qr.js';
import {
	newsletterWelcomeEmail,
	registrationConfirmationEmail,
	registrationDeclinedEmail,
	registrationReceivedEmail
} from '../src/email/templates.js';
import type { EmailMessage } from '../src/email/types.js';

/**
 * One realistic set of values, shared by the preview and the smoke test so
 * what you look at in a browser is exactly what lands in the inbox.
 *
 * The name carries a Lao vowel above the line and the venue a comma — both are
 * things that have broken email layouts before.
 */
export const SITE_URL = process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173';

const TICKET_CODE = 'K7M4QP2X';

/** Matches what the seed puts on the first event, so previews look real. */
const COVER_IMAGE_URL = 'https://placehold.co/1200x630/141629/8c52ff?text=Community+Day+2026';

function doc(...paragraphs: string[]): RichTextDoc {
	return {
		type: 'doc',
		content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
	};
}

const EVENT = {
	lo: {
		title: 'AWS Community Day ວຽງຈັນ 2026',
		location: 'ໂຮງແຮມລ້ານຊ້າງ, ນະຄອນຫຼວງວຽງຈັນ',
		description: doc(
			'ງານ AWS Community Day ຄັ້ງທຳອິດຢູ່ ສປປ ລາວ — ມື້ດຽວເຕັມໄປດ້ວຍການບັນຍາຍ, ການສາທິດ ແລະ ການພົບປະກັບຄົນທີ່ເຮັດວຽກດ້ານຄລາວໃນພາກພື້ນ.',
			'ມີການບັນຍາຍທັງພາສາລາວ ແລະ ພາສາອັງກິດ. ບໍ່ເສຍຄ່າເຂົ້າຮ່ວມ.'
		)
	},
	en: {
		title: 'AWS Community Day Vientiane 2026',
		location: 'Lane Xang Hotel, Vientiane',
		description: doc(
			'The first AWS Community Day in Laos — a full day of talks, demos and hallway conversation with the people building on the cloud across the region.',
			'Sessions run in both Lao and English. Attendance is free.'
		)
	}
} as const;

const NAME = { lo: 'ສົມສະຫວາດ ພົມມະຈັນ', en: 'Somsavath Phommachanh' } as const;

export async function sampleMessages(
	locale: Locale
): Promise<Array<EmailMessage & { id: string }>> {
	const event = EVENT[locale === 'lo' ? 'lo' : 'en'];
	const qr = await renderTicketQr(TICKET_CODE);

	const registration = registrationConfirmationEmail({
		locale,
		siteUrl: SITE_URL,
		fullName: NAME[locale === 'lo' ? 'lo' : 'en'],
		eventTitle: event.title,
		startAt: new Date('2026-09-19T09:00:00+07:00'),
		locationName: event.location,
		ticketCode: TICKET_CODE,
		ticketUrl: `${SITE_URL}/events/community-day-2026/ticket/${TICKET_CODE}`,
		coverImageUrl: COVER_IMAGE_URL,
		description: event.description,
		qr
	});

	const newsletter = newsletterWelcomeEmail(
		locale,
		`${SITE_URL}/newsletter/unsubscribe?token=sample-token`,
		SITE_URL
	);

	const pending = {
		locale,
		siteUrl: SITE_URL,
		fullName: NAME[locale === 'lo' ? 'lo' : 'en'],
		eventTitle: event.title,
		startAt: new Date('2026-09-19T09:00:00+07:00'),
		locationName: event.location,
		coverImageUrl: COVER_IMAGE_URL
	};

	return [
		{ id: `registration-${locale}`, to: 'attendee@example.com', ...registration },
		{
			id: `received-${locale}`,
			to: 'attendee@example.com',
			...registrationReceivedEmail(pending)
		},
		{
			id: `declined-${locale}`,
			to: 'attendee@example.com',
			...registrationDeclinedEmail({
				...pending,
				note:
					locale === 'lo'
						? 'ຄັ້ງນີ້ມີຜູ້ລົງທະບຽນຫຼາຍກວ່າບ່ອນນັ່ງທີ່ມີ.'
						: 'We had more registrations than seats this time.'
			})
		},
		// Without a note, which is the version that has to stand on its own.
		{
			id: `declined-plain-${locale}`,
			to: 'attendee@example.com',
			...registrationDeclinedEmail(pending)
		},
		{ id: `newsletter-${locale}`, to: 'subscriber@example.com', ...newsletter }
	];
}
