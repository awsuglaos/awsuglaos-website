/**
 * A file carried inside the message rather than linked from it.
 *
 * Set `contentId` to reference the part from the HTML as `<img src="cid:…">`.
 * Both real dispatchers support this; the ticket QR is the only current use,
 * and it always ships alongside a link so a client that strips inline images
 * still leaves the reader something to act on.
 */
export interface EmailAttachment {
	filename: string;
	content: Uint8Array;
	contentType: string;
	contentId?: string;
}

export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
	attachments?: EmailAttachment[];
}

/**
 * Phase 1 sends mail inline from the request. Phase 2 swaps in an implementation
 * that pushes onto SQS so the user is not waiting on the provider — everything
 * behind this interface stays unchanged when that happens.
 */
export interface EmailDispatcher {
	send(message: EmailMessage): Promise<void>;
}
