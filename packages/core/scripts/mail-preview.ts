/*
 * Renders every template to a file you can open in a browser.
 *
 *   pnpm mail:preview
 *
 * A browser is not a mail client and will flatter the markup — it honours the
 * <style> block and the border radii that Outlook drops. Use this to iterate on
 * copy and layout, and `pnpm mail:send` to find out what actually arrives.
 */
import { LOCALES } from '@awsug/shared';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleMessages } from './fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = join(root, '.mail-preview');

await mkdir(out, { recursive: true });

const written: string[] = [];

for (const locale of LOCALES) {
	for (const message of await sampleMessages(locale)) {
		/*
		 * cid: URLs mean nothing to a browser, so the two inline attachments are
		 * written beside the page and pointed at locally. The generated HTML is
		 * otherwise untouched — what you see below this line is what ships.
		 */
		let html = message.html;
		for (const attachment of message.attachments ?? []) {
			if (!attachment.contentId) continue;
			await writeFile(join(out, attachment.filename), attachment.content);
			html = html.replace(`src="cid:${attachment.contentId}"`, `src="./${attachment.filename}"`);
		}
		const file = join(out, `${message.id}.html`);
		await writeFile(file, html, 'utf8');
		written.push(file);

		await writeFile(
			join(out, `${message.id}.txt`),
			`${message.subject}\n\n${message.text}\n`,
			'utf8'
		);
	}
}

console.log(`Wrote ${written.length} previews:`);
for (const file of written) console.log(`  ${file}`);
console.log('\nPlain-text parts are alongside them as .txt — they are what a');
console.log('watch or a text-only client shows, and they are worth reading too.');
