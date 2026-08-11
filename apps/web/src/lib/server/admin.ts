import { redirect, type Cookies } from '@sveltejs/kit';
import { api, type ApiClient } from './api';
import { readSession } from './session';

/**
 * Builds an API client from the session cookie. The `(protected)` layout has
 * already verified the token, so this only re-reads it — but it redirects
 * rather than throwing if the cookie vanished between requests.
 */
export function adminApi(cookies: Cookies, fetchFn: typeof fetch): ApiClient {
	const token = readSession(cookies);
	if (!token) redirect(303, '/admin/login');
	return api(token, fetchFn);
}
