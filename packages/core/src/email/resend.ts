import { Resend } from 'resend';
import type { EmailDispatcher, EmailMessage } from './types.js';

export interface ResendConfig {
	apiKey: string;
	/** Composed sender, e.g. "AWS User Group Laos <noreply@awsug.la>". */
	from: string;
}

/**
 * The interim provider while SES production access is pending. Selection
 * happens in each app's context: this wins over SES when RESEND_API_KEY is set,
 * so switching back later is one environment variable and no code change.
 */
export class ResendEmailDispatcher implements EmailDispatcher {
	private readonly client: Resend;

	constructor(
		private readonly config: ResendConfig,
		client?: Resend
	) {
		this.client = client ?? new Resend(config.apiKey);
	}

	async send(message: EmailMessage): Promise<void> {
		const { error } = await this.client.emails.send({
			from: this.config.from,
			to: [message.to],
			subject: message.subject,
			html: message.html,
			text: message.text,
			...(message.attachments?.length
				? {
						attachments: message.attachments.map((attachment) => ({
							// The SDK takes a Buffer directly and base64-encodes it itself.
							content: Buffer.from(attachment.content),
							filename: attachment.filename,
							contentType: attachment.contentType,
							...(attachment.contentId ? { contentId: attachment.contentId } : {})
						}))
					}
				: {})
			// No replyTo: noreply@ is unmonitored by design, and the footer says so.
		});

		/*
		 * The SDK reports failures in the response rather than throwing. Left
		 * unchecked, a rejected send would look exactly like a delivered one —
		 * so translate it into the exception the callers already expect. Both
		 * send sites log and swallow, so a Resend outage still cannot undo a
		 * registration or a subscription.
		 */
		if (error) {
			throw new Error(`Resend rejected the message: ${error.name} — ${error.message}`);
		}
	}
}
