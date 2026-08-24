import { env } from '$env/dynamic/private';
import { api } from '$lib/server/api';
import {
	authorizeUrl,
	cognitoConfigured,
	createPkcePair,
	createState,
	OAUTH_COOKIE_OPTIONS,
	OAUTH_NEXT_COOKIE,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE
} from '$lib/server/cognito';
import { field } from '$lib/server/form';
import { setSession } from '$lib/server/session';
import { isDomainError } from '@awsug/shared';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const devAuth = () => env.DEV_AUTH === 'true';

/**
 * Failures in the callback have nowhere of their own to render — it is a
 * `+server.ts` endpoint, not a page — so they come back here as an error code
 * in the query string.
 */
const CALLBACK_ERRORS: Record<string, string> = {
	cancelled: 'Sign-in was cancelled.',
	state: 'That sign-in link has expired. Please try again.',
	exchange: 'Could not complete sign-in with Cognito. Please try again.',
	unauthorised: 'That account is not authorised for the backoffice.',
	unreachable: 'Signed in, but the API could not be reached. Please try again.'
};

export const load: PageServerLoad = async ({ url }) => {
	const code = url.searchParams.get('error');

	return {
		devAuth: devAuth(),
		cognitoReady: cognitoConfigured(),
		...(code ? { error: CALLBACK_ERRORS[code] ?? 'Sign-in failed. Please try again.' } : {})
	};
};

export const actions: Actions = {
	/**
	 * Local sign-in only. With DEV_AUTH off this action refuses outright, so the
	 * shim cannot be reached in a deployed stage even if the page renders.
	 */
	dev: async ({ request, cookies, fetch, url }) => {
		if (!devAuth()) {
			return fail(403, { message: 'Local sign-in is disabled. Use the Cognito login.' });
		}

		const data = await request.formData();
		const email = field(data, 'email');
		if (!email) return fail(400, { message: 'Enter your email address' });

		const token = `dev:${email.toLowerCase()}`;

		// Verify before storing, so an unauthorised address fails at the login
		// screen rather than looking signed in and 403-ing on the next page.
		try {
			await api(token, fetch).get('/admin/dashboard');
		} catch (error) {
			if (isDomainError(error) && (error.status === 401 || error.status === 403)) {
				return fail(403, { message: 'That account is not authorised for the backoffice.' });
			}
			return fail(502, { message: 'Could not reach the API. Is it running on port 3000?' });
		}

		setSession(cookies, token);

		const next = url.searchParams.get('next');
		redirect(303, next && next.startsWith('/admin') ? next : '/admin');
	},

	/**
	 * Starts the Hosted UI authorization-code flow.
	 *
	 * A POST rather than a link on purpose: an anchor is a prefetch target, and
	 * SvelteKit's link preloading would mint one state/verifier pair on hover and
	 * another on click, so the pair the callback checks would never be the pair
	 * the browser was sent with.
	 */
	cognito: async ({ cookies, url }) => {
		if (!cognitoConfigured()) {
			return fail(503, { message: 'Cognito sign-in is not configured for this environment.' });
		}

		const state = createState();
		const { verifier, challenge } = createPkcePair();

		cookies.set(OAUTH_STATE_COOKIE, state, OAUTH_COOKIE_OPTIONS);
		cookies.set(OAUTH_VERIFIER_COOKIE, verifier, OAUTH_COOKIE_OPTIONS);

		// Carried across the round trip so a deep link survives the detour through
		// Cognito. Only same-site admin paths, or it becomes an open redirect.
		const next = url.searchParams.get('next');
		if (next && next.startsWith('/admin')) {
			cookies.set(OAUTH_NEXT_COOKIE, next, OAUTH_COOKIE_OPTIONS);
		} else {
			cookies.delete(OAUTH_NEXT_COOKIE, { path: OAUTH_COOKIE_OPTIONS.path });
		}

		redirect(303, authorizeUrl({ state, challenge }));
	}
};
