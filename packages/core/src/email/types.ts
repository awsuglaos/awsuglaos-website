export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
}

/**
 * Phase 1 sends mail inline from the request. Phase 2 swaps in an implementation
 * that pushes onto SQS so the user is not waiting on SES — everything behind
 * this interface stays unchanged when that happens.
 */
export interface EmailDispatcher {
	send(message: EmailMessage): Promise<void>;
}
