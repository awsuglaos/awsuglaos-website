import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import {
	ConsoleEmailDispatcher,
	LocalObjectStore,
	SesEmailDispatcher,
	type AppContext,
	type EmailDispatcher
} from '@awsug/core';
import { createDatabase, resolveDbConfig } from '@awsug/db';
import { resolve } from 'node:path';

function createEmailDispatcher(): EmailDispatcher {
	// Without a verified SES sender we print to the console instead — which is
	// what makes the whole app runnable before the AWS account exists.
	const from = env.SES_FROM_ADDRESS;
	if (!from) return new ConsoleEmailDispatcher();

	return new SesEmailDispatcher({
		from,
		...(env.SES_CONFIGURATION_SET ? { configurationSetName: env.SES_CONFIGURATION_SET } : {})
	});
}

/**
 * True when there is no S3 bucket, so uploads are served from the filesystem.
 *
 * This mirrors exactly how apps/api chooses its ObjectStore, and is the right
 * condition to gate the local upload routes on — `dev` is not, because
 * `vite preview` runs a production build against the same local storage and
 * would otherwise 404 every upload.
 */
export function usingLocalUploads(): boolean {
	return !env.UPLOADS_BUCKET;
}

/**
 * Local uploads are written by this app rather than by the API: with no S3 to
 * presign against, the "upload URL" the API hands out points back here. On AWS
 * this store is never used — the browser PUTs straight to the bucket.
 */
export function localUploadStore(): LocalObjectStore {
	return new LocalObjectStore({
		root: resolve(process.cwd(), env.LOCAL_UPLOAD_ROOT ?? '../../.uploads')
	});
}

let cached: Promise<AppContext> | undefined;

/**
 * Built once per container and reused across requests, so a warm Lambda keeps
 * its database client and credential chain.
 *
 * Config comes from `$env/dynamic/private` rather than `process.env`: Vite
 * loads the repo-root .env into SvelteKit's env module without mutating the
 * process environment, so reading process.env here would find nothing in dev.
 */
export function getContext(): Promise<AppContext> {
	cached ??= (async () => ({
		db: await createDatabase(resolveDbConfig(env)),
		email: createEmailDispatcher(),
		// From the *public* module: the private one filters out the PUBLIC_ prefix
		// entirely, so this read would always be undefined and every ticket,
		// feedback and unsubscribe link in outgoing email would point at localhost.
		siteUrl: publicEnv.PUBLIC_SITE_URL ?? 'http://localhost:5173'
	}))();
	return cached;
}
