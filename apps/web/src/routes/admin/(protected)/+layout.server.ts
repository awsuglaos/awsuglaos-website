import { api } from '$lib/server/api';
import { clearSession, readSession } from '$lib/server/session';
import { isDomainError } from '@awsug/shared';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export interface Dashboard {
	totals: {
		events: number;
		publishedEvents: number;
		articles: number;
		publishedArticles: number;
		registrations: number;
		checkedIn: number;
		subscribers: number;
	};
	events: {
		id: string;
		slug: string;
		title: string;
		startAt: string;
		capacity: number;
		registered: number;
		checkedIn: number;
		checkInRate: number;
	}[];
}

/**
 * Guards the whole backoffice. It lives in a `(protected)` route group so that
 * /admin/login — which must stay reachable while signed out — does not inherit
 * it and cause a redirect loop. The group name is not part of the URL, so the
 * dashboard is still served at /admin.
 */
export const load: LayoutServerLoad = async ({ cookies, url, fetch }) => {
	const token = readSession(cookies);
	if (!token) redirect(303, `/admin/login?next=${encodeURIComponent(url.pathname)}`);

	/*
	 * The sidebar writes its own collapsed state to this cookie client-side.
	 * Reading it here means the server renders the sidebar in the state the
	 * operator left it in — without this the markup always ships expanded and
	 * snaps shut on hydration.
	 */
	const sidebarOpen = cookies.get('sidebar_state') !== 'false';

	try {
		// Cheapest authenticated call that proves the token still works, and its
		// result feeds the dashboard and the nav counts.
		const dashboard = await api(token, fetch).get<Dashboard>('/admin/dashboard');
		return { dashboard, sidebarOpen };
	} catch (error) {
		if (isDomainError(error) && (error.status === 401 || error.status === 403)) {
			clearSession(cookies);
			redirect(303, `/admin/login?next=${encodeURIComponent(url.pathname)}`);
		}
		throw error;
	}
};
