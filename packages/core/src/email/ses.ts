import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailAttachment, EmailDispatcher, EmailMessage } from './types.js';

export interface SesConfig {
	/** Verified sender, e.g. "AWS User Group Laos <noreply@awsug.la>". */
	from: string;
	/** Optional configuration set for open/bounce tracking. */
	configurationSetName?: string;
}

/**
 * SESv2 carries attachments inside `Simple` content, so there is no raw MIME to
 * assemble here — the SDK base64-encodes `RawContent` on our behalf. Anything
 * with a `contentId` is declared INLINE so `<img src="cid:…">` resolves against
 * it; anything without one is a normal attachment.
 */
function toSesAttachments(attachments: EmailAttachment[]) {
	return attachments.map((attachment) => ({
		RawContent: attachment.content,
		FileName: attachment.filename,
		ContentType: attachment.contentType,
		ContentTransferEncoding: 'BASE64' as const,
		...(attachment.contentId
			? { ContentId: attachment.contentId, ContentDisposition: 'INLINE' as const }
			: { ContentDisposition: 'ATTACHMENT' as const })
	}));
}

export class SesEmailDispatcher implements EmailDispatcher {
	private readonly client: SESv2Client;

	constructor(
		private readonly config: SesConfig,
		client?: SESv2Client
	) {
		this.client = client ?? new SESv2Client({});
	}

	async send(message: EmailMessage): Promise<void> {
		await this.client.send(
			new SendEmailCommand({
				FromEmailAddress: this.config.from,
				Destination: { ToAddresses: [message.to] },
				...(this.config.configurationSetName
					? { ConfigurationSetName: this.config.configurationSetName }
					: {}),
				Content: {
					Simple: {
						Subject: { Data: message.subject, Charset: 'UTF-8' },
						Body: {
							Html: { Data: message.html, Charset: 'UTF-8' },
							Text: { Data: message.text, Charset: 'UTF-8' }
						},
						...(message.attachments?.length
							? { Attachments: toSesAttachments(message.attachments) }
							: {})
					}
				}
			})
		);
	}
}
