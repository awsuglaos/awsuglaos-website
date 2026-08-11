import { adminApi } from '$lib/server/admin';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Streams the API's CSV straight through rather than buffering and re-encoding
 * it, so the download works the same whether the list has 10 rows or 10,000 —
 * and the admin's session token never reaches the browser.
 */
export const GET: RequestHandler = async ({ params, cookies, fetch }) => {
	const upstream = await adminApi(cookies, fetch).raw(
		`/admin/events/${params.id}/registrations.csv`
	);

	if (!upstream.ok || !upstream.body) {
		error(upstream.status === 404 ? 404 : 502, 'Could not generate the export');
	}

	return new Response(upstream.body, {
		headers: {
			'content-type': upstream.headers.get('content-type') ?? 'text/csv; charset=utf-8',
			'content-disposition':
				upstream.headers.get('content-disposition') ?? 'attachment; filename="registrations.csv"',
			'cache-control': 'private, no-store'
		}
	});
};
