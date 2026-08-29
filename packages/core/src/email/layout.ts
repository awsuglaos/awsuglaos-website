import { EMAIL_LOGO_PNG_BASE64 } from './logo.js';
import type { EmailAttachment } from './types.js';

/**
 * The shared shell every message is built into.
 *
 * Two constraints shape everything here and neither is negotiable:
 *
 * 1. **Inline styles only.** Mail clients strip `<style>` blocks
 *    unpredictably, so every rule that matters is on the element. The one
 *    `<style>` block below carries dark-mode hints and nothing the layout
 *    depends on — delete it and the email still reads correctly.
 * 2. **Tables, not flexbox.** Outlook renders through Word, which has no
 *    modern box model at all. A 600px table with explicit cell padding is the
 *    only structure that survives it.
 *
 * Colours are the site's own tokens from theme.css, resolved from OKLCH to hex
 * once here. design.md says never write a raw colour; email markup cannot read
 * CSS variables, so this file is the single place the resolution happens and
 * everything downstream refers to PALETTE.
 */

export const PALETTE = {
	/** --primary: the only saturated colour on this brand. */
	violet: '#8c52ff',
	/** --foreground: the near-black navy the header band is painted in. */
	ink: '#141629',
	/** --secondary: the lavender that edges the ticket panel. */
	lavender: '#e6daff',
	/** Violet at ~4% over white — the ticket panel's fill. */
	violetWash: '#f7f3ff',
	/** --muted-foreground: labels, footer, anything secondary. */
	slate: '#626480',
	/** --border. */
	border: '#e2e2e8',
	/** --muted: the paper the card sits on. */
	paper: '#f4f4f7',
	/** --sidebar: the detail panel's fill. */
	panel: '#f8f9fc',
	white: '#ffffff'
} as const;

/**
 * Noto Sans Lao leads: the site self-hosts it, but email cannot, so this is a
 * request that the reader's device already has it — and Lao devices do.
 */
export const FONT_SANS = "'Noto Sans Lao','Noto Sans',Helvetica,Arial,sans-serif";

/**
 * The annotation register from design.md — ticket codes and slugs only. It
 * carries no Lao fallback, so a translated string must never be set in it.
 */
export const FONT_MONO = "'Fira Code','SF Mono',Consolas,Menlo,monospace";

/** Referenced from every layout as `<img src="cid:brand-logo">`. */
export const BRAND_LOGO_CONTENT_ID = 'brand-logo';

/**
 * The header logo, as an attachment to be shipped with every message.
 *
 * A fresh Uint8Array per call rather than a shared module-level one: the
 * dispatchers hand these to SDKs that may retain or transform the buffer, and
 * a singleton shared across concurrent sends in a warm Lambda is the kind of
 * bug that only shows up under load.
 */
export function brandLogoAttachment(): EmailAttachment {
	return {
		filename: 'awsug-lao.png',
		content: Uint8Array.from(Buffer.from(EMAIL_LOGO_PNG_BASE64, 'base64')),
		contentType: 'image/png',
		contentId: BRAND_LOGO_CONTENT_ID
	};
}

/**
 * Uploaded images are stored site-relative (`/uploads/…`), which resolves
 * against nothing in an email client and renders as a broken image. Anything
 * already absolute — a seeded placeholder, a separate CDN host — is left alone.
 */
export function absoluteUrl(url: string, siteUrl: string): string {
	if (/^https?:\/\//i.test(url)) return url;
	return `${siteUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export interface CoverImage {
	/** Already absolute — run it through `absoluteUrl` first. */
	url: string;
	alt: string;
}

export interface LayoutParams {
	locale: string;
	/** The inbox preview line. Without it, clients show the raw greeting. */
	preheader: string;
	body: string;
	/**
	 * The event's own cover, shown full-bleed under the header band.
	 *
	 * Remote rather than attached, unlike the logo: covers are uploaded by
	 * organisers at whatever size they like, and putting an unbounded image
	 * inside every confirmation is how a mail server starts rejecting them.
	 * It is decoration — nothing the reader needs is only in this image.
	 */
	cover?: CoverImage;
	/** Rendered under the rule at the bottom, above the standing footer. */
	footerExtra?: string;
}

function coverRow(cover: CoverImage): string {
	return `
        <tr><td style="background:${PALETTE.white};font-size:0;line-height:0">
          <img src="${escapeHtml(cover.url)}" width="600" alt="${escapeHtml(cover.alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0" />
        </td></tr>`;
}

/**
 * A row of label and value inside the detail panel.
 *
 * `mono` is for the ticket code and nothing else — see FONT_MONO. Labels are
 * translated strings and are always set in the sans stack.
 */
export function detailRow(label: string, value: string, mono = false): string {
	const valueStyle = mono
		? `font-family:${FONT_MONO};font-size:14px;letter-spacing:0.08em;color:${PALETTE.ink}`
		: `font-family:${FONT_SANS};font-size:15px;color:${PALETTE.ink}`;

	return `<tr>
        <td style="padding:10px 0;vertical-align:top;white-space:nowrap;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${PALETTE.slate}">${escapeHtml(label)}</td>
        <td style="padding:10px 0 10px 20px;vertical-align:top;text-align:right;${valueStyle}">${escapeHtml(value)}</td>
      </tr>`;
}

/** The bordered label/value block. Rows come from `detailRow`. */
export function detailPanel(rows: string): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PALETTE.panel};border:1px solid ${PALETTE.border};border-radius:12px;margin:0 0 28px">
      <tr><td style="padding:6px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr>
    </table>`;
}

/**
 * A "bulletproof" button: the VML rectangle is what Outlook draws, the anchor
 * is what everything else draws, and each is hidden from the other. A plain
 * padded `<a>` alone collapses to bare underlined text in Outlook.
 */
export function button(href: string, label: string): string {
	const url = escapeHtml(href);
	const text = escapeHtml(label);

	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
      <tr><td align="center" style="border-radius:10px" bgcolor="${PALETTE.violet}">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:260px" arcsize="21%" stroke="f" fillcolor="${PALETTE.violet}">
        <w:anchorlock/>
        <center style="color:${PALETTE.white};font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${text}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FONT_SANS};font-size:16px;font-weight:600;line-height:20px;color:${PALETTE.white};text-decoration:none;border-radius:10px;background:${PALETTE.violet}">${text}</a>
        <!--<![endif]-->
      </td></tr>
    </table>`;
}

/**
 * The QR panel. `alt` carries the ticket code so a client that refuses inline
 * images still shows something the reader can read out at the door — Resend's
 * own documentation warns that some webmail clients drop them.
 */
export function ticketPanel(ticketCode: string, caption: string, altPrefix: string): string {
	const code = escapeHtml(ticketCode);

	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PALETTE.violetWash};border:1px solid ${PALETTE.lavender};border-radius:14px;margin:0 0 28px">
      <tr><td align="center" style="padding:28px 20px 24px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${PALETTE.white};border-radius:10px">
          <tr><td style="padding:12px;line-height:0">
            <img src="cid:ticket-qr" width="200" height="200" alt="${escapeHtml(altPrefix)} ${code}" style="display:block;width:200px;height:200px;border:0" />
          </td></tr>
        </table>
        <div style="font-family:${FONT_SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${PALETTE.slate};margin:18px 0 6px">${escapeHtml(caption)}</div>
        <div style="font-family:${FONT_MONO};font-size:22px;font-weight:700;letter-spacing:0.16em;color:${PALETTE.ink}">${code}</div>
      </td></tr>
    </table>`;
}

export function heading(text: string): string {
	return `<h1 style="margin:0 0 16px;font-family:${FONT_SANS};font-size:24px;line-height:1.35;font-weight:700;letter-spacing:-0.02em;color:${PALETTE.ink}">${text}</h1>`;
}

export function paragraph(html: string, marginBottom = 20): string {
	return `<p style="margin:0 0 ${marginBottom}px;font-family:${FONT_SANS};font-size:16px;line-height:1.8;color:${PALETTE.ink}">${html}</p>`;
}

export function layout(params: LayoutParams): string {
	const { locale, preheader, body, footerExtra, cover } = params;

	return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>AWS User Group Laos</title>
<!--
  Enhancement only. Every colour the layout depends on is already inline, so a
  client that drops this block still renders the light design correctly.
-->
<style>
  @media (prefers-color-scheme: dark) {
    .awsug-paper { background: ${PALETTE.ink} !important; }
    .awsug-card { background: #1d1f36 !important; }
    .awsug-ink { color: #f4f4f7 !important; }
    .awsug-panel { background: #232541 !important; border-color: #33355a !important; }
  }
</style>
</head>
<body class="awsug-paper" style="margin:0;padding:0;width:100%;background:${PALETTE.paper};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}</div>
  <!-- Pads the preview line so the client stops before it reaches the body. -->
  <div style="display:none;max-height:0;overflow:hidden">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="awsug-paper" style="background:${PALETTE.paper}">
    <tr><td align="center" style="padding:32px 16px">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

        <!-- Header band. The logo rides along as an inline attachment rather
             than a URL: a remote image is blocked by default in a good share
             of clients, and resolves against nothing at all when the site is
             not publicly reachable. The alt text is white on navy, so even a
             client that strips inline images leaves a legible wordmark. -->
        <tr><td align="center" style="background:${PALETTE.ink};border-radius:16px 16px 0 0;padding:28px 24px 24px">
          <img src="cid:${BRAND_LOGO_CONTENT_ID}" width="200" height="60" alt="AWS User Group Laos" style="display:block;width:200px;max-width:60%;height:auto;border:0;font-family:${FONT_SANS};font-size:16px;font-weight:600;color:${PALETTE.white}" />
        </td></tr>
        <tr><td style="background:${PALETTE.violet};font-size:0;line-height:0;height:3px">&nbsp;</td></tr>
${cover ? coverRow(cover) : ''}
        <tr><td class="awsug-card" style="background:${PALETTE.white};border-radius:0 0 16px 16px;padding:${cover ? '28px' : '36px'} 32px 32px">
          ${body}
        </td></tr>

        <tr><td style="padding:24px 32px 0">
          ${footerExtra ?? ''}
          <p style="margin:0 0 6px;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${PALETTE.slate}">AWS User Group Laos &middot; Vientiane, Laos</p>
          <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${PALETTE.slate}">This message was sent from an address that is not monitored. Please do not reply to it.</p>
        </td></tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}
