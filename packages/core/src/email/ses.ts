import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailDispatcher, EmailMessage } from './types.js';

export interface SesConfig {
	/** Verified sender, e.g. "AWS User Group Lao <hello@awsug.la>". */
	from: string;
	/** Optional configuration set for open/bounce tracking. */
	configurationSetName?: string;
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
						}
					}
				}
			})
		);
	}
}
