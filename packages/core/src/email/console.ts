import type { EmailAttachment, EmailDispatcher, EmailMessage } from './types.js';

function describeAttachments(attachments: EmailAttachment[] | undefined): string {
	if (!attachments?.length) return '';
	const parts = attachments.map(
		(a) => `${a.filename} (${a.contentType}, ${Math.round(a.content.byteLength / 1024)} KB)`
	);
	return `Files:   ${parts.join(', ')}\n`;
}

/** Local development: prints instead of sending, so no provider is needed. */
export class ConsoleEmailDispatcher implements EmailDispatcher {
	readonly sent: EmailMessage[] = [];

	async send(message: EmailMessage): Promise<void> {
		this.sent.push(message);
		console.log(
			`\n──── email ────\nTo:      ${message.to}\nSubject: ${message.subject}\n` +
				describeAttachments(message.attachments) +
				`\n${message.text}\n───────────────\n`
		);
	}
}

/** Test double: records messages and stays silent. */
export class MemoryEmailDispatcher implements EmailDispatcher {
	readonly sent: EmailMessage[] = [];

	async send(message: EmailMessage): Promise<void> {
		this.sent.push(message);
	}
}
