import type { UserRole } from '@awsug/shared';

/**
 * The identity provider, kept behind an interface for the same reason
 * `EmailDispatcher` is: local development has no Cognito, and the backoffice
 * must still be usable without an AWS account.
 *
 * Note what is *not* here — roles. Cognito owns identity (who you are, MFA,
 * passwords); the `users` table owns authorization (what you may do). Keeping
 * roles out of Cognito groups means revoking someone is one row delete, and it
 * cannot drift out of sync with a directory we do not control.
 */
export interface DirectoryUser {
	email: string;
	name: string;
}

export interface UserDirectory {
	/** Creates the identity and sends an invitation. Idempotency is the caller's job. */
	invite(user: DirectoryUser & { role: UserRole }): Promise<{ subject: string | null }>;
	/** Removes the identity. Safe to call when it does not exist. */
	remove(email: string): Promise<void>;
	/** Blocks sign-in without deleting history. */
	disable(email: string): Promise<void>;
}
