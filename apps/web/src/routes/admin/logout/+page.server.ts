import { cognitoConfigured, logoutUrl } from '$lib/server/cognito';
import { clearSession } from '$lib/server/session';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	redirect(303, '/admin/login');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		clearSession(cookies);

		/*
		 * Dropping the local cookie is only half of a sign-out. The Hosted UI keeps
		 * a session cookie of its own, so without this hop the next sign-in
		 * reauthenticates silently and the operator never sees a prompt — which
		 * looks exactly like the sign-out did nothing. Matters most on a shared
		 * laptop at a meetup.
		 */
		if (cognitoConfigured()) redirect(303, logoutUrl());

		redirect(303, '/admin/login');
	}
};
