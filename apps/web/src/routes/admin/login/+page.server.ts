import { env } from '$env/dynamic/private';
import { api } from '$lib/server/api';
import { field } from '$lib/server/form';
import { setSession } from '$lib/server/session';
import { isDomainError } from '@awsug/shared';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const devAuth = () => env.DEV_AUTH === 'true';

export const load: PageServerLoad = async () => ({ devAuth: devAuth() });

export const actions: Actions = {
	/**
	 * Local sign-in only. With DEV_AUTH off this action refuses outright, so the
	 * shim cannot be reached in a deployed stage even if the page renders.
	 *
	 * Production replaces this with the Cognito Hosted UI authorization-code
	 * flow (M8): redirect to Cognito, exchange the code in a /admin/callback
	 * route, then call setSession with the resulting access token. Everything
	 * downstream of the cookie stays identical.
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
	}
};
