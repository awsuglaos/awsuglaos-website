import { env } from '$env/dynamic/private';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError } from '@sveltejs/kit';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			// Sets <html lang> so screen readers and the Lao font stack both get the
			// right language.
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

/**
 * Keeps every stage except production out of search results.
 *
 * routes/robots.txt/+server.ts asks crawlers not to fetch; this is what stops
 * the indexing. The two are not interchangeable — a URL discovered from a link
 * elsewhere can be indexed without ever being fetched, so `Disallow` alone
 * would not prevent `staging.awsug.la` appearing in results.
 *
 * Set from `ALLOW_INDEXING` in sst.config.ts, which is 'true' on production
 * only. Unset means not indexable, so a stage nobody configured fails closed.
 */
const handleIndexing: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (env.ALLOW_INDEXING !== 'true') {
		response.headers.set('x-robots-tag', 'noindex, nofollow');
	}
	return response;
};

export const handle: Handle = sequence(handleParaglide, handleIndexing);

export const handleError: HandleServerError = ({ error, status }) => {
	// 404s are noise; anything else is worth a CloudWatch line.
	if (status !== 404) {
		console.error('Unhandled server error', error);
	}
	return { message: 'Unexpected error' };
};
