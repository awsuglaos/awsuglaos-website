import type { UserRole } from '@awsug/shared';
import type { DirectoryUser, UserDirectory } from './types.js';

/**
 * Local development and tests: the `users` table alone is the directory, since
 * DEV_AUTH accepts any email that has a row. Invitations are logged rather than
 * sent, so inviting a colleague locally is instant and silent.
 */
export class LocalUserDirectory implements UserDirectory {
	readonly invited: (DirectoryUser & { role: UserRole })[] = [];
	readonly removed: string[] = [];
	readonly disabled: string[] = [];

	async invite(user: DirectoryUser & { role: UserRole }): Promise<{ subject: string | null }> {
		this.invited.push(user);
		console.log(`[dev] invited ${user.email} as ${user.role} — sign in with: dev:${user.email}`);
		return { subject: null };
	}

	async remove(email: string): Promise<void> {
		this.removed.push(email);
	}

	async disable(email: string): Promise<void> {
		this.disabled.push(email);
	}
}
