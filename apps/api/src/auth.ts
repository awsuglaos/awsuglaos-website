import { users, type User } from '@awsug/db';
import { ForbiddenError, UnauthorizedError, type UserRole } from '@awsug/shared';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { getContext } from './context.js';
import { readEnv } from './env.js';

export interface AuthVariables {
	user: User;
}

interface VerifiedIdentity {
	email: string;
	sub: string | null;
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getVerifier() {
	const env = readEnv();
	if (!env.cognito) throw new Error('Cognito is not configured');
	// Built once — the verifier caches the pool's JWKS, so per-request creation
	// would refetch the signing keys on every call.
	verifier ??= CognitoJwtVerifier.create({
		userPoolId: env.cognito.userPoolId,
		clientId: env.cognito.clientId,
		/*
		 * The ID token, not the access token. Identity here means an email
		 * address, and `email` is a claim only the ID token carries. A Cognito
		 * access token would offer `username`, which — because the pool is
		 * configured with `usernames: ['email']` — is a generated UUID rather than
		 * the address, so it would match no row in `users` and every request would
		 * 403. The extraction below has always read `email` first; this is the
		 * token type that actually supplies it.
		 */
		tokenUse: 'id'
	});
	return verifier;
}

/**
 * The local shim. Tokens look like `dev:someone@example.la` and are accepted
 * only when DEV_AUTH=true, which readEnv() refuses to combine with
 * NODE_ENV=production.
 */
function parseDevToken(token: string): VerifiedIdentity | null {
	if (!token.startsWith('dev:')) return null;
	const email = token.slice(4).trim().toLowerCase();
	return email ? { email, sub: null } : null;
}

async function verifyToken(token: string): Promise<VerifiedIdentity> {
	const env = readEnv();

	if (env.devAuth) {
		const dev = parseDevToken(token);
		if (dev) return dev;
	}

	if (!env.cognito) throw new UnauthorizedError('Invalid token');

	try {
		const payload = await getVerifier().verify(token);
		const email =
			typeof payload['email'] === 'string'
				? payload['email']
				: typeof payload['username'] === 'string'
					? payload['username']
					: null;
		if (!email) throw new UnauthorizedError('Token carries no email claim');
		return { email: email.toLowerCase(), sub: String(payload.sub) };
	} catch (error) {
		if (error instanceof UnauthorizedError) throw error;
		throw new UnauthorizedError('Invalid or expired token');
	}
}

/**
 * Identity comes from Cognito; *authorisation* comes from the users table. A
 * valid token for someone with no row here is rejected, so revoking access is a
 * single delete rather than a Cognito group edit.
 */
export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
	const header = c.req.header('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
	if (!token) throw new UnauthorizedError();

	const identity = await verifyToken(token);
	const ctx = await getContext();

	const [user] = await ctx.db.select().from(users).where(eq(users.email, identity.email)).limit(1);
	if (!user) throw new ForbiddenError('This account is not authorised for the backoffice');

	// Bind the Cognito subject on first sign-in so the row is linked to the
	// identity provider from then on.
	if (identity.sub && !user.cognitoSub) {
		await ctx.db.update(users).set({ cognitoSub: identity.sub }).where(eq(users.id, user.id));
	}

	c.set('user', user);
	await next();
};

/** Route guard. Admins can do everything an editor can. */
export function requireRole(
	...allowed: UserRole[]
): MiddlewareHandler<{ Variables: AuthVariables }> {
	return async (c, next) => {
		const user = c.get('user');
		if (!user) throw new UnauthorizedError();
		if (user.role !== 'admin' && !allowed.includes(user.role)) {
			throw new ForbiddenError();
		}
		await next();
	};
}

export function currentUser(c: Context<{ Variables: AuthVariables }>): User {
	const user = c.get('user');
	if (!user) throw new UnauthorizedError();
	return user;
}
