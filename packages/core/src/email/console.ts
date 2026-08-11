import type { EmailDispatcher, EmailMessage } from './types.js';

/** Local development: prints instead of sending, so no AWS account is needed. */
export class ConsoleEmailDispatcher implements EmailDispatcher {
	readonly sent: EmailMessage[] = [];

	async send(message: EmailMessage): Promise<void> {
		this.sent.push(message);
		console.log(
			`\n──── email ────\nTo:      ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n───────────────\n`
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
