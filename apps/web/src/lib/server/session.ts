import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'awsug_session';

/**
 * The access token lives in an httpOnly cookie so browser JavaScript can never
 * read it — an XSS bug in the admin UI cannot exfiltrate a valid admin token.
 * `sameSite: 'lax'` still allows normal top-level navigation back from the
 * Cognito Hosted UI redirect.
 */
export function setSession(cookies: Cookies, token: string, maxAgeSeconds = 60 * 60 * 8): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: maxAgeSeconds
	});
}

export function readSession(cookies: Cookies): string | undefined {
	return cookies.get(SESSION_COOKIE);
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
