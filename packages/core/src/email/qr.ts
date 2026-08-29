import QRCode from 'qrcode';
import type { EmailAttachment } from './types.js';

/** Referenced from the confirmation template as `<img src="cid:ticket-qr">`. */
export const TICKET_QR_CONTENT_ID = 'ticket-qr';

/**
 * PNG rather than the SVG the ticket page renders: no mail client draws inline
 * SVG. Encoded at 480px so it stays sharp on a 2x phone screen at the 200px it
 * is displayed, which is also the size a scanner wants when someone holds the
 * phone up at the door.
 *
 * The payload and error-correction level match the ticket page exactly, so the
 * same code scans identically whether it comes from the email or the web page.
 */
export async function renderTicketQr(ticketCode: string): Promise<EmailAttachment> {
	const content = await QRCode.toBuffer(ticketCode, {
		type: 'png',
		width: 480,
		margin: 1,
		errorCorrectionLevel: 'M',
		color: { dark: '#000000', light: '#ffffff' }
	});

	return {
		filename: `ticket-${ticketCode}.png`,
		content,
		contentType: 'image/png',
		contentId: TICKET_QR_CONTENT_ID
	};
}
