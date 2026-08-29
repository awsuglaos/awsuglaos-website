/*
 * Sends one of each template, for real, through Resend.
 *
 *   pnpm mail:send you@example.com
 *
 * This is the check that matters before an event: open the result on a phone,
 * in Gmail and in Outlook, with images blocked and unblocked. The preview
 * script cannot tell you any of that.
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '@awsug/shared';
import { ResendEmailDispatcher } from '../src/email/resend.js';
import { composeSender } from '../src/email/select.js';
import { sampleMessages } from './fixtures.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const recipient = process.argv[2];
if (!recipient?.includes('@')) {
	console.error('Usage: pnpm mail:send <recipient@example.com>');
	process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
const mailFrom = process.env.MAIL_FROM_EMAIL;
if (!apiKey || !mailFrom) {
	console.error('RESEND_API_KEY and MAIL_FROM_EMAIL must be set in the repo-root .env.');
	process.exit(1);
}

const from = composeSender(process.env.MAIL_FROM_NAME, mailFrom);
const dispatcher = new ResendEmailDispatcher({ apiKey, from });

console.log(`Sending as ${from} → ${recipient}\n`);

for (const locale of LOCALES) {
	for (const message of await sampleMessages(locale)) {
		// Deliberately serial: a failure should stop and be read, not scroll past.
		await dispatcher.send({ ...message, to: recipient });
		console.log(`  sent ${message.id.padEnd(20)} ${message.subject}`);
	}
}

console.log('\nDone. Check the inbox on a phone, and check the spam folder too —');
console.log('a brand-new sending domain lands there until it has some reputation.');
