import { richTextToPlainText, type RichTextDoc } from '@awsug/shared';
import { richTextExtensions } from '@awsug/shared/tiptap';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import sanitizeHtml from 'sanitize-html';

/**
 * Turns a stored TipTap document into HTML safe to inject into a page.
 *
 * Phase 1 rendered content as text nodes precisely so `{@html}` was never
 * needed. Rich text brings it back, so this function is the only place content
 * becomes markup, and it always sanitises. Two independent gates:
 *
 *   1. ProseMirror refuses to build a document containing a node type outside
 *      our extension schema — it *throws* rather than dropping it, so nothing
 *      unrecognised can reach the output.
 *   2. `sanitize-html` then strips anything outside the tag/attribute allowlist
 *      below — which catches marks or attributes an extension might emit that
 *      we did not anticipate.
 *
 * Because gate 1 throws, the call is wrapped: a document that fails to build
 * must not take the whole page down with a 500. That happens for reasons other
 * than an attack — removing an extension leaves older documents unrenderable —
 * so the failure degrades to plain text and logs, rather than erroring out.
 *
 * `@tiptap/static-renderer` is used rather than `@tiptap/html` because it needs
 * no DOM, keeping jsdom out of the Lambda bundle entirely.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'p',
		'br',
		'strong',
		'em',
		'u',
		's',
		'code',
		'pre',
		'h2',
		'h3',
		'h4',
		'ul',
		'ol',
		'li',
		'blockquote',
		'hr',
		'a',
		'img',
		'table',
		'thead',
		'tbody',
		'tr',
		'th',
		'td'
	],
	allowedAttributes: {
		a: ['href', 'title', 'target', 'rel'],
		img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
		th: ['colspan', 'rowspan'],
		td: ['colspan', 'rowspan']
	},
	// No `javascript:` or `data:` URLs — the latter is how an SVG payload sneaks
	// scriptable content past an image-only allowlist.
	allowedSchemes: ['http', 'https', 'mailto'],
	allowedSchemesByTag: { img: ['http', 'https'] },
	allowProtocolRelative: false,
	transformTags: {
		// Outbound links open in a new tab and cannot reach back through
		// window.opener.
		a: (tagName, attribs) => ({
			tagName,
			attribs: {
				...attribs,
				...(attribs.href?.startsWith('http')
					? { target: '_blank', rel: 'noopener noreferrer nofollow' }
					: {})
			}
		}),
		// Images below the fold should not block first paint.
		img: (tagName, attribs) => ({
			tagName,
			attribs: { ...attribs, loading: 'lazy', decoding: 'async' }
		})
	}
};

export function renderRichText(doc: RichTextDoc | null | undefined): string {
	if (!doc?.content?.length) return '';

	let html: string;
	try {
		html = renderToHTMLString({
			extensions: richTextExtensions,
			// TipTap's JSONContent declares its optional members without `| undefined`,
			// which `exactOptionalPropertyTypes` rejects against our own interface.
			// The shapes are identical at runtime.
			content: doc as Parameters<typeof renderToHTMLString>[0]['content']
		});
	} catch (error) {
		// Unrenderable document — fall back to its text so the page still works.
		console.error('Rich text render failed; falling back to plain text', {
			error: error instanceof Error ? error.message : String(error)
		});
		return sanitizeHtml(
			richTextToPlainText(doc)
				.split(/\n{2,}/)
				.filter(Boolean)
				.map((p) => `<p>${p}</p>`)
				.join(''),
			SANITIZE_OPTIONS
		);
	}

	return sanitizeHtml(html, SANITIZE_OPTIONS);
}
