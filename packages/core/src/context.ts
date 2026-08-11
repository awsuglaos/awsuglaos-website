import type { Database } from '@awsug/db';
import type { EmailDispatcher } from './email/types.js';
import type { ObjectStore } from './storage/types.js';
import type { UserDirectory } from './directory/types.js';

/**
 * Everything a service needs, passed explicitly rather than imported from
 * module scope — which is what makes the services testable against a real
 * throwaway database with recording adapters.
 *
 * `storage` and `directory` are optional because most of the app does not need
 * them: only uploads and user administration do. Making them required would
 * force every test that touches an event to stand up an S3 client.
 */
export interface AppContext {
	db: Database;
	email: EmailDispatcher;
	/** Absolute public origin, used to build ticket, feedback and unsubscribe links. */
	siteUrl: string;
	storage?: ObjectStore;
	directory?: UserDirectory;
	/** Injectable clock so time-dependent rules can be tested. */
	now?: () => Date;
}

export function currentTime(ctx: AppContext): Date {
	return ctx.now ? ctx.now() : new Date();
}

export function requireStorage(ctx: AppContext): ObjectStore {
	if (!ctx.storage) throw new Error('No object store is configured for this context');
	return ctx.storage;
}

export function requireDirectory(ctx: AppContext): UserDirectory {
	if (!ctx.directory) throw new Error('No user directory is configured for this context');
	return ctx.directory;
}
