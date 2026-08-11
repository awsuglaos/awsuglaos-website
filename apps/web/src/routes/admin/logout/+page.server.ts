import { clearSession } from '$lib/server/session';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	redirect(303, '/admin/login');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		clearSession(cookies);
		redirect(303, '/admin/login');
	}
};
