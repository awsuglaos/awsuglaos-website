import type { Locale } from '@awsug/shared';
import type { EmailMessage } from './types.js';

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

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function layout(bodyHtml: string): string {
	// Inline styles only — email clients strip <style> blocks unpredictably.
	// The generous line-height matters for Lao, whose stacked vowel and tone
	// marks clip at the default leading.
	return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:'Noto Sans Lao','Noto Sans',Helvetica,Arial,sans-serif;line-height:1.8;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0" />
    <p style="font-size:12px;color:#6b7280;margin:0">AWS User Group Lao</p>
  </div>
</body>
</html>`;
}

interface RegistrationEmailParams {
	locale: Locale;
	fullName: string;
	eventTitle: string;
	startAt: Date;
	locationName: string;
	ticketCode: string;
	ticketUrl: string;
}

export function registrationConfirmationEmail(
	params: RegistrationEmailParams
): Omit<EmailMessage, 'to'> {
	const when = formatEventDate(params.startAt, params.locale);

	if (params.locale === 'lo') {
		const text = [
			`ສະບາຍດີ ${params.fullName},`,
			'',
			`ການລົງທະບຽນຂອງທ່ານສຳລັບ "${params.eventTitle}" ໄດ້ຮັບການຢືນຢັນແລ້ວ.`,
			'',
			`ວັນທີ: ${when}`,
			`ສະຖານທີ່: ${params.locationName}`,
			`ລະຫັດປີ້: ${params.ticketCode}`,
			'',
			`ກະລຸນານຳ QR code ມາໃນມື້ງານເພື່ອລົງທະບຽນເຂົ້າ:`,
			params.ticketUrl,
			'',
			'ຂອບໃຈ,',
			'AWS User Group Lao'
		].join('\n');

		return {
			subject: `ຢືນຢັນການລົງທະບຽນ — ${params.eventTitle}`,
			text,
			html: layout(`
        <p style="margin:0 0 16px">ສະບາຍດີ ${escapeHtml(params.fullName)},</p>
        <p style="margin:0 0 24px">ການລົງທະບຽນຂອງທ່ານສຳລັບ <strong>${escapeHtml(params.eventTitle)}</strong> ໄດ້ຮັບການຢືນຢັນແລ້ວ.</p>
        <table style="width:100%;font-size:14px;margin:0 0 24px">
          <tr><td style="padding:4px 0;color:#6b7280">ວັນທີ</td><td style="padding:4px 0">${escapeHtml(when)}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280">ສະຖານທີ່</td><td style="padding:4px 0">${escapeHtml(params.locationName)}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280">ລະຫັດປີ້</td><td style="padding:4px 0"><code>${escapeHtml(params.ticketCode)}</code></td></tr>
        </table>
        <p style="margin:0 0 8px">ກະລຸນານຳ QR code ມາໃນມື້ງານ:</p>
        <p style="margin:0"><a href="${escapeHtml(params.ticketUrl)}" style="display:inline-block;background:#ff9900;color:#111827;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">ເປີດປີ້ຂອງທ່ານ</a></p>
      `)
		};
	}

	const text = [
		`Hello ${params.fullName},`,
		'',
		`Your registration for "${params.eventTitle}" is confirmed.`,
		'',
		`When:   ${when}`,
		`Where:  ${params.locationName}`,
		`Ticket: ${params.ticketCode}`,
		'',
		'Bring your QR code on the day to check in:',
		params.ticketUrl,
		'',
		'See you there,',
		'AWS User Group Lao'
	].join('\n');

	return {
		subject: `Registration confirmed — ${params.eventTitle}`,
		text,
		html: layout(`
      <p style="margin:0 0 16px">Hello ${escapeHtml(params.fullName)},</p>
      <p style="margin:0 0 24px">Your registration for <strong>${escapeHtml(params.eventTitle)}</strong> is confirmed.</p>
      <table style="width:100%;font-size:14px;margin:0 0 24px">
        <tr><td style="padding:4px 0;color:#6b7280">When</td><td style="padding:4px 0">${escapeHtml(when)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Where</td><td style="padding:4px 0">${escapeHtml(params.locationName)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Ticket</td><td style="padding:4px 0"><code>${escapeHtml(params.ticketCode)}</code></td></tr>
      </table>
      <p style="margin:0 0 8px">Bring your QR code on the day:</p>
      <p style="margin:0"><a href="${escapeHtml(params.ticketUrl)}" style="display:inline-block;background:#ff9900;color:#111827;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Open your ticket</a></p>
    `)
	};
}

export function newsletterWelcomeEmail(
	locale: Locale,
	unsubscribeUrl: string
): Omit<EmailMessage, 'to'> {
	if (locale === 'lo') {
		return {
			subject: 'ຂອບໃຈທີ່ຕິດຕາມ AWS User Group Lao',
			text: `ຂອບໃຈທີ່ລົງທະບຽນຮັບຂ່າວສານຈາກ AWS User Group Lao.\n\nພວກເຮົາຈະສົ່ງຂ່າວງານ ແລະ ບົດຄວາມໃໝ່ໃຫ້ທ່ານ.\n\nຍົກເລີກການຮັບຂ່າວ: ${unsubscribeUrl}`,
			html: layout(`
        <p style="margin:0 0 16px">ຂອບໃຈທີ່ລົງທະບຽນຮັບຂ່າວສານຈາກ <strong>AWS User Group Lao</strong>.</p>
        <p style="margin:0 0 24px">ພວກເຮົາຈະສົ່ງຂ່າວງານ ແລະ ບົດຄວາມໃໝ່ໃຫ້ທ່ານ.</p>
        <p style="margin:0;font-size:12px;color:#6b7280"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">ຍົກເລີກການຮັບຂ່າວ</a></p>
      `)
		};
	}

	return {
		subject: 'Thanks for subscribing to AWS User Group Lao',
		text: `Thanks for subscribing to AWS User Group Lao.\n\nWe'll send you event announcements and new articles.\n\nUnsubscribe: ${unsubscribeUrl}`,
		html: layout(`
      <p style="margin:0 0 16px">Thanks for subscribing to <strong>AWS User Group Lao</strong>.</p>
      <p style="margin:0 0 24px">We'll send you event announcements and new articles.</p>
      <p style="margin:0;font-size:12px;color:#6b7280"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a></p>
    `)
	};
}
