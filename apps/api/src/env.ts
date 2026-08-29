import { composeSender } from '@awsug/core';

/**
 * On Lambda these arrive as real environment variables from SST resource
 * linking. Locally they come from the repo-root .env, loaded by src/dev.ts.
 */
export interface ApiEnv {
	devAuth: boolean;
	siteUrl: string;
	cognito?: {
		userPoolId: string;
		clientId: string;
	};
	ses?: {
		from: string;
		configurationSet?: string;
	};
	/** Takes precedence over `ses` while SES production access is pending. */
	resend?: {
		apiKey: string;
		from: string;
	};
	uploads?: {
		bucket: string;
		/** Only when objects are served from a different host than the site. */
		publicBaseUrl?: string;
	};
	/** Filesystem root used when there is no bucket (local development). */
	localUploadRoot?: string;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
	const userPoolId = source.COGNITO_USER_POOL_ID;
	const clientId = source.COGNITO_CLIENT_ID;
	const from = source.SES_FROM_ADDRESS;

	// Fail loudly rather than silently accepting the dev shim in a deployed
	// stage: an unauthenticated admin API is the worst possible default.
	const devAuth = source.DEV_AUTH === 'true';
	if (devAuth && source.NODE_ENV === 'production') {
		throw new Error('DEV_AUTH must not be enabled when NODE_ENV=production');
	}
	if (!devAuth && !(userPoolId && clientId)) {
		throw new Error(
			'Cognito is not configured. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID, ' +
				'or set DEV_AUTH=true for local development.'
		);
	}

	const uploadsBucket = source.UPLOADS_BUCKET;
	const siteUrl = source.PUBLIC_SITE_URL ?? 'http://localhost:5173';

	const resendApiKey = source.RESEND_API_KEY;
	const mailFromEmail = source.MAIL_FROM_EMAIL;

	return {
		devAuth,
		siteUrl,
		...(uploadsBucket
			? {
					uploads: {
						bucket: uploadsBucket,
						// Unset means site-relative URLs, which is what you want when
						// CloudFront serves /uploads/* from the site's own distribution.
						...(source.UPLOADS_PUBLIC_URL ? { publicBaseUrl: source.UPLOADS_PUBLIC_URL } : {})
					}
				}
			: { localUploadRoot: source.LOCAL_UPLOAD_ROOT ?? '.uploads' }),
		...(userPoolId && clientId ? { cognito: { userPoolId, clientId } } : {}),
		...(from
			? {
					ses: {
						from,
						...(source.SES_CONFIGURATION_SET
							? { configurationSet: source.SES_CONFIGURATION_SET }
							: {})
					}
				}
			: {}),
		...(resendApiKey && mailFromEmail
			? {
					resend: {
						apiKey: resendApiKey,
						from: composeSender(source.MAIL_FROM_NAME, mailFromEmail)
					}
				}
			: {})
	};
}
