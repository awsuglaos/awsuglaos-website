import { api } from '$lib/server/api';
import {
	exchangeCode,
	OAUTH_NEXT_COOKIE,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
	takeOAuthCookie
} from '$lib/server/cognito';
import { setSession } from '$lib/server/session';
import { isDomainError } from '@awsug/shared';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Where Cognito's Hosted UI sends the browser back to.
 *
 * A `+server.ts` and not a page: Cognito returns by plain GET navigation and
 * there is nothing here to render — every outcome is a redirect. It also sits
 * deliberately *outside* the `(protected)` group. Inside it, the group's layout
 * guard would run before the session cookie is set, bounce to /admin/login, and
 * the flow would never complete.
 */
/*
 * The `never` annotation is deliberate and load-bearing. TypeScript only treats
 * a call as never-returning when the callee carries an *explicit* type, so
 * without it every `fail(...)` below would look like it might fall through and
 * the compiler would reject `code`, `verifier` and `idToken` as possibly unset.
 */
const fail: (reason: string) => never = (reason) => redirect(303, `/admin/login?error=${reason}`);

export const GET: RequestHandler = async ({ url, cookies, fetch }) => {
	// Always consume the one-shot cookies, whatever happens next, so a failed
	// attempt cannot leave a verifier lying around for the next one to reuse.
	const expectedState = takeOAuthCookie(cookies, OAUTH_STATE_COOKIE);
	const verifier = takeOAuthCookie(cookies, OAUTH_VERIFIER_COOKIE);
	const next = takeOAuthCookie(cookies, OAUTH_NEXT_COOKIE);

	// The operator hit "cancel" at the Hosted UI, or Cognito refused outright.
	if (url.searchParams.get('error')) fail('cancelled');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	/*
	 * The CSRF check. Both halves have to be present and equal: without the
	 * state comparison, an attacker could feed their own authorization code to a
	 * signed-out admin and land them in the attacker's session.
	 */
	if (!code || !state || !expectedState || !verifier || state !== expectedState) {
		fail('state');
	}

	let idToken: string;
	try {
		({ idToken } = await exchangeCode(code, verifier, fetch));
	} catch {
		fail('exchange');
	}

	/*
	 * Prove the token is *authorised*, not merely valid, before storing it —
	 * exactly as the dev action does.
	 *
	 * This is what stops a redirect loop. Cognito will happily authenticate a
	 * pool user who has no `users` row; the API then 403s, the (protected)
	 * layout clears the session and redirects to /admin/login, the Hosted UI
	 * still holds its own session and returns immediately — and round it goes.
	 * Checking here breaks the cycle with a message instead.
	 */
	try {
		await api(idToken, fetch).get('/admin/dashboard');
	} catch (error) {
		if (isDomainError(error) && (error.status === 401 || error.status === 403)) {
			fail('unauthorised');
		}
		fail('unreachable');
	}

	setSession(cookies, idToken);

	redirect(303, next && next.startsWith('/admin') ? next : '/admin');
};
