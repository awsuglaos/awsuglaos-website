import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Served from a route rather than `static/robots.txt`, because the correct
 * answer differs per stage and a static file cannot.
 *
 * Every stage now has a real, publicly resolving hostname — production on the
 * apex, everything else on `<stage>.awsug.la` — and staging is a
 * byte-for-byte copy of production. A shared static file would invite crawlers
 * into staging and hand them production's sitemap URL from the staging host,
 * so the site would compete with itself on its own content.
 *
 * This only asks crawlers not to *fetch*. A URL discovered elsewhere can still
 * be indexed without ever being fetched, which is why hooks.server.ts also
 * sends `X-Robots-Tag` on non-production stages. That header is the part that
 * actually prevents indexing; this is the part that stops the crawl.
 */
export const GET: RequestHandler = ({ url, setHeaders }) => {
	setHeaders({
		'content-type': 'text/plain; charset=utf-8',
		'cache-control': 'public, max-age=3600'
	});

	// Unset counts as "no". A stage nobody remembered to configure should fail
	// into obscurity, not into Google.
	if (env.ALLOW_INDEXING !== 'true') {
		return new Response('User-agent: *\nDisallow: /\n');
	}

	// Built from the request's own origin rather than hardcoded, so this file
	// can never point crawlers at a different host than the one they asked.
	return new Response(
		`User-agent: *
Allow: /

# Tickets carry personal data behind unguessable URLs, and the admin area is
# authenticated — neither belongs in an index.
Disallow: /admin
Disallow: /en/admin
Disallow: /events/*/ticket/
Disallow: /en/events/*/ticket/
Disallow: /newsletter

Sitemap: ${url.origin}/sitemap.xml
`
	);
};
