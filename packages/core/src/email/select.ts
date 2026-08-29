/**
 * Builds the RFC 5322 display-name form the providers expect, e.g.
 * `AWS User Group Laos <noreply@awsug.la>`.
 *
 * A name containing a comma, a quote or a bracket would break the header, so
 * it is quoted when it holds anything outside the safe atom set. In practice
 * MAIL_FROM_NAME is "AWS User Group Laos" and no quoting happens — this exists
 * so a stray character in an env var cannot silently produce an address the
 * provider rejects.
 */
export function composeSender(name: string | undefined, email: string): string {
	const trimmed = name?.trim();
	if (!trimmed) return email;
	const safe = /^[A-Za-z0-9 '\-.\u0E80-\u0EFF]+$/u.test(trimmed);
	return safe ? `${trimmed} <${email}>` : `"${trimmed.replace(/["\\]/g, '')}" <${email}>`;
}

export type EmailProvider = 'resend' | 'ses' | 'console';

/**
 * One line at start-up saying which way mail is going. Without it the only
 * symptom of a misconfigured stage is silence — and both send sites swallow
 * their errors by design, so silence is exactly what you would get.
 */
export function describeEmailProvider(provider: EmailProvider, from?: string): string {
	if (provider === 'console') {
		return 'email: no provider configured — messages will be printed to the console';
	}
	return `email: sending via ${provider} as ${from}`;
}
