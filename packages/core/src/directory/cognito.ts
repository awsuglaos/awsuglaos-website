import {
	AdminCreateUserCommand,
	AdminDeleteUserCommand,
	AdminDisableUserCommand,
	CognitoIdentityProviderClient,
	UsernameExistsException,
	UserNotFoundException
} from '@aws-sdk/client-cognito-identity-provider';
import { UserExistsError, type UserRole } from '@awsug/shared';
import type { DirectoryUser, UserDirectory } from './types.js';

export interface CognitoDirectoryConfig {
	userPoolId: string;
}

export class CognitoUserDirectory implements UserDirectory {
	private readonly client: CognitoIdentityProviderClient;

	constructor(
		private readonly config: CognitoDirectoryConfig,
		client?: CognitoIdentityProviderClient
	) {
		this.client = client ?? new CognitoIdentityProviderClient({});
	}

	async invite(user: DirectoryUser & { role: UserRole }): Promise<{ subject: string | null }> {
		try {
			const result = await this.client.send(
				new AdminCreateUserCommand({
					UserPoolId: this.config.userPoolId,
					Username: user.email,
					UserAttributes: [
						{ Name: 'email', Value: user.email },
						// Pre-verified: the invitation itself proves the address works,
						// and an unverified account cannot complete the MFA setup the
						// pool requires.
						{ Name: 'email_verified', Value: 'true' },
						{ Name: 'name', Value: user.name }
					],
					DesiredDeliveryMediums: ['EMAIL']
				})
			);

			const sub = result.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
			return { subject: sub ?? null };
		} catch (error) {
			if (error instanceof UsernameExistsException) throw new UserExistsError(user.email);
			throw error;
		}
	}

	async remove(email: string): Promise<void> {
		try {
			await this.client.send(
				new AdminDeleteUserCommand({ UserPoolId: this.config.userPoolId, Username: email })
			);
		} catch (error) {
			// Already gone is the desired end state, not a failure.
			if (error instanceof UserNotFoundException) return;
			throw error;
		}
	}

	async disable(email: string): Promise<void> {
		try {
			await this.client.send(
				new AdminDisableUserCommand({ UserPoolId: this.config.userPoolId, Username: email })
			);
		} catch (error) {
			if (error instanceof UserNotFoundException) return;
			throw error;
		}
	}
}
