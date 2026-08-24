import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { Cookies } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';

/**
 * The Cognito Hosted UI authorization-code flow.
 *
 * The backoffice never sees a password. It bounces the operator to Cognito,
 * which handles the password, the forced first-login change and the TOTP
 * enrolment the pool requires, and hands back a code. The code is exchanged
 * here — server-side, inside the SvelteKit handler — so the resulting token
 * goes straight into an httpOnly cookie without ever passing through client
 * JavaScript.
 *
 * The client is public: SST does not set `generateSecret`, so there is no
 * secret to hold. PKCE is what stands in for one — a stolen code is useless
 * without the verifier, which stays in an httpOnly cookie on this origin.
 */

export const OAUTH_STATE_COOKIE = 'admin_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'admin_oauth_verifier';
export const OAUTH_NEXT_COOKIE = 'admin_oauth_next';

/**
 * Scoped to /admin and short-lived: these exist only for the seconds between
 * leaving for the Hosted UI and coming back.
 *
 * `sameSite: 'lax'` is load-bearing, not a default. Cognito returns the browser
 * here by top-level GET navigation, which `lax` allows and `strict` would not —
 * under `strict` the cookies would be withheld on exactly the request that needs
 * them, and every sign-in would fail the state check.
 */
export const OAUTH_COOKIE_OPTIONS = {
	path: '/admin',
	httpOnly: true,
	sameSite: 'lax',
	secure: !dev,
	maxAge: 600
} as const;

/** One-shot by construction: read and cleared in the same request. */
export function takeOAuthCookie(cookies: Cookies, name: string): string | undefined {
	const value = cookies.get(name);
	cookies.delete(name, { path: OAUTH_COOKIE_OPTIONS.path });
	return value;
}

/** Narrower than the pool's defaults; the app reads `email` and nothing else. */
const SCOPES = 'openid email profile';

interface CognitoConfig {
	domain: string;
	clientId: string;
	/** Must match a registered callback URL byte for byte, or Cognito refuses. */
	redirectUri: string;
	loginUri: string;
}

/**
 * Returns null when the stage has no pool wired up, which is the normal state
 * of a developer machine. Callers use that to fall back to the DEV_AUTH shim
 * rather than crashing.
 */
function config(): CognitoConfig | null {
	const domain = env.COGNITO_DOMAIN_URL?.replace(/\/+$/, '');
	const clientId = env.COGNITO_CLIENT_ID;
	// Public module: PUBLIC_-prefixed names are absent from $env/dynamic/private.
	const siteUrl = publicEnv.PUBLIC_SITE_URL?.replace(/\/+$/, '');
	if (!domain || !clientId || !siteUrl) return null;

	return {
		domain,
		clientId,
		redirectUri: `${siteUrl}/admin/callback`,
		loginUri: `${siteUrl}/admin/login`
	};
}

export function cognitoConfigured(): boolean {
	return config() !== null;
}

function requireConfig(): CognitoConfig {
	const resolved = config();
	if (!resolved) {
		throw new Error(
			'Cognito is not configured. Set COGNITO_DOMAIN_URL, COGNITO_CLIENT_ID and ' +
				'PUBLIC_SITE_URL, or set DEV_AUTH=true for local development.'
		);
	}
	return resolved;
}

/** Opaque, single-use, and checked at the callback: the CSRF guard on the flow. */
export function createState(): string {
	return randomBytes(16).toString('base64url');
}

export interface PkcePair {
	verifier: string;
	challenge: string;
}

export function createPkcePair(): PkcePair {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}

export function authorizeUrl(options: { state: string; challenge: string }): string {
	const { domain, clientId, redirectUri } = requireConfig();

	const params = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		scope: SCOPES,
		redirect_uri: redirectUri,
		state: options.state,
		code_challenge: options.challenge,
		code_challenge_method: 'S256'
	});

	return `${domain}/oauth2/authorize?${params}`;
}

/**
 * Ends the Hosted UI's own session as well as the local one. Without this,
 * signing out and back in silently reauthenticates against Cognito's cookie —
 * which looks like the sign-out did nothing.
 */
export function logoutUrl(): string {
	const { domain, clientId, loginUri } = requireConfig();

	const params = new URLSearchParams({
		client_id: clientId,
		logout_uri: loginUri
	});

	return `${domain}/logout?${params}`;
}

export interface CognitoTokens {
	idToken: string;
	accessToken: string;
	refreshToken?: string;
	expiresIn: number;
}

interface TokenResponse {
	id_token?: string;
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
}

/**
 * Exchanges the authorization code for tokens.
 *
 * The *ID* token is the one that matters downstream: it is the only one that
 * carries an `email` claim, which is what apps/api/src/auth.ts matches against
 * the users table. A Cognito access token would carry the pool's generated UUID
 * as its username instead, and no row would ever match it.
 */
export async function exchangeCode(
	code: string,
	verifier: string,
	fetchFn: typeof fetch = fetch
): Promise<CognitoTokens> {
	const { domain, clientId, redirectUri } = requireConfig();

	const response = await fetchFn(`${domain}/oauth2/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: clientId,
			code,
			redirect_uri: redirectUri,
			code_verifier: verifier
		})
	});

	const body = (await response.json().catch(() => ({}))) as TokenResponse;

	if (!response.ok || !body.id_token || !body.access_token) {
		// `error_description` is the useful half — "invalid_grant" alone does not
		// distinguish a replayed code from a mismatched redirect_uri.
		const detail = body.error_description ?? body.error ?? `HTTP ${response.status}`;
		throw new Error(`Cognito token exchange failed: ${detail}`);
	}

	return {
		idToken: body.id_token,
		accessToken: body.access_token,
		...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
		expiresIn: body.expires_in ?? 3600
	};
}
