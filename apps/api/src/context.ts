import {
	CognitoUserDirectory,
	ConsoleEmailDispatcher,
	LocalObjectStore,
	LocalUserDirectory,
	ResendEmailDispatcher,
	S3ObjectStore,
	SesEmailDispatcher,
	type AppContext,
	type EmailDispatcher,
	type ObjectStore,
	type UserDirectory
} from '@awsug/core';
import { createDatabase, resolveDbConfig } from '@awsug/db';
import { resolve } from 'node:path';
import { readEnv, type ApiEnv } from './env.js';

/** Resend first, SES second, console last — mirrors apps/web's context.ts. */
function createEmailDispatcher(env: ApiEnv): EmailDispatcher {
	if (env.resend) return new ResendEmailDispatcher(env.resend);
	if (!env.ses) return new ConsoleEmailDispatcher();
	return new SesEmailDispatcher({
		from: env.ses.from,
		...(env.ses.configurationSet ? { configurationSetName: env.ses.configurationSet } : {})
	});
}

function createObjectStore(env: ApiEnv): ObjectStore {
	if (env.uploads) {
		return new S3ObjectStore({
			bucket: env.uploads.bucket,
			// Empty means site-relative, which is the normal case: CloudFront serves
			// /uploads/* from the site's own distribution.
			...(env.uploads.publicBaseUrl ? { publicBaseUrl: env.uploads.publicBaseUrl } : {})
		});
	}

	// No bucket configured: write to disk and let the dev server serve them back,
	// so image upload works with no AWS account.
	return new LocalObjectStore({
		root: resolve(process.cwd(), env.localUploadRoot ?? '.uploads')
	});
}

function createDirectory(env: ApiEnv): UserDirectory {
	if (!env.cognito) return new LocalUserDirectory();
	return new CognitoUserDirectory({ userPoolId: env.cognito.userPoolId });
}

let cached: Promise<AppContext> | undefined;

/** Module-level singleton so a warm Lambda reuses its clients. */
export function getContext(): Promise<AppContext> {
	cached ??= (async () => {
		const env = readEnv();
		return {
			db: await createDatabase(resolveDbConfig()),
			email: createEmailDispatcher(env),
			storage: createObjectStore(env),
			directory: createDirectory(env),
			siteUrl: env.siteUrl
		};
	})();
	return cached;
}
