import type { RichTextDoc } from '@awsug/shared';
import { describe, expect, it } from 'vitest';
import { renderRichText } from '../src/content/render.js';

function doc(...content: unknown[]): RichTextDoc {
	return { type: 'doc', content: content as RichTextDoc['content'] };
}

function paragraph(text: string, marks?: unknown[]) {
	return { type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] };
}

describe('renderRichText', () => {
	it('renders paragraphs, headings and lists', () => {
		const html = renderRichText(
			doc(
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
				paragraph('Doors open at 09:00.'),
				{
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [paragraph('Registration')] },
						{ type: 'listItem', content: [paragraph('Keynote')] }
					]
				}
			)
		);

		expect(html).toContain('<h2>Agenda</h2>');
		expect(html).toContain('<p>Doors open at 09:00.</p>');
		expect(html).toContain('<li><p>Registration</p></li>');
	});

	it('preserves Lao text intact', () => {
		const html = renderRichText(doc(paragraph('ງານລວມຕົວປະຈຳປີຂອງຊຸມຊົນ AWS')));
		expect(html).toContain('ງານລວມຕົວປະຈຳປີຂອງຊຸມຊົນ AWS');
	});

	it('renders tables', () => {
		const html = renderRichText(
			doc({
				type: 'table',
				content: [
					{
						type: 'tableRow',
						content: [
							{ type: 'tableHeader', content: [paragraph('Time')] },
							{ type: 'tableHeader', content: [paragraph('Session')] }
						]
					},
					{
						type: 'tableRow',
						content: [
							{ type: 'tableCell', content: [paragraph('09:00')] },
							{ type: 'tableCell', content: [paragraph('Welcome')] }
						]
					}
				]
			})
		);

		expect(html).toContain('<table>');
		expect(html).toContain('Session');
		expect(html).toContain('09:00');
	});

	/* ---------------------------------------------------------------------- */
	/* Sanitisation — this is why the renderer exists at all                  */
	/* ---------------------------------------------------------------------- */

	/**
	 * ProseMirror throws on a node type outside the schema rather than dropping
	 * it, so this asserts two things at once: the smuggled node never renders,
	 * and an unrenderable document degrades to text instead of throwing a 500
	 * out of the page load.
	 */
	it('degrades safely when the document contains an unknown node type', () => {
		const html = renderRichText(
			doc(
				{ type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
				paragraph('Safe text')
			)
		);

		expect(html).not.toContain('<script');
		expect(html).toContain('Safe text');
		// The smuggled text survives only as escaped plain text, never as markup.
		expect(html).not.toMatch(/<script[^>]*>/);
	});

	it('drops event-handler attributes', () => {
		const html = renderRichText(
			doc({
				type: 'image',
				attrs: { src: 'https://example.la/a.png', alt: 'x', onerror: 'alert(1)' }
			})
		);

		expect(html).not.toContain('onerror');
		expect(html).not.toContain('alert(1)');
	});

	it('refuses javascript: and data: URLs', () => {
		const link = renderRichText(
			doc(
				paragraph('click', [
					{ type: 'link', attrs: { href: 'javascript:alert(1)' } }
				])
			)
		);
		expect(link).not.toContain('javascript:');

		const image = renderRichText(
			doc({
				type: 'image',
				attrs: { src: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+' }
			})
		);
		expect(image).not.toContain('data:image/svg');
	});

	it('escapes markup typed as literal text', () => {
		const html = renderRichText(doc(paragraph('<script>alert(1)</script>')));
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('hardens outbound links against tabnabbing', () => {
		const html = renderRichText(
			doc(paragraph('aws', [{ type: 'link', attrs: { href: 'https://aws.amazon.com' } }]))
		);
		expect(html).toContain('rel="noopener noreferrer nofollow"');
		expect(html).toContain('target="_blank"');
	});

	it('returns an empty string for an empty document', () => {
		expect(renderRichText({ type: 'doc', content: [] })).toBe('');
		expect(renderRichText(null)).toBe('');
	});
});
