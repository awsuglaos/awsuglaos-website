import { getContext } from '$lib/server/context';
import { locales, localizeHref } from '$lib/paraglide/runtime';
import { articleService, eventService } from '@awsug/core';
import type { RequestHandler } from './$types';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Every URL is listed once per locale with reciprocal `alternate` links, which
 * is what tells search engines the Lao and English pages are one document in two
 * languages rather than duplicates.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const ctx = await getContext();
	const origin = url.origin;

	const [events, articles] = await Promise.all([
		eventService.listPublishedEvents(ctx, { locale: 'lo' }),
		articleService.listPublishedArticles(ctx, { locale: 'lo' })
	]);

	const paths = [
		{ path: '/', changefreq: 'weekly', priority: '1.0', lastmod: null as Date | null },
		{ path: '/events', changefreq: 'daily', priority: '0.9', lastmod: null },
		{ path: '/news', changefreq: 'daily', priority: '0.8', lastmod: null },
		{ path: '/feedback', changefreq: 'weekly', priority: '0.5', lastmod: null },
		...events.map((e) => ({
			path: `/events/${e.slug}`,
			changefreq: 'weekly',
			priority: '0.8',
			lastmod: e.startAt
		})),
		...articles.map((a) => ({
			path: `/news/${a.slug}`,
			changefreq: 'monthly',
			priority: '0.6',
			lastmod: a.publishedAt
		}))
	];

	const entries = paths.flatMap((entry) =>
		locales.map((locale) => {
			const alternates = locales
				.map(
					(alt) =>
						`    <xhtml:link rel="alternate" hreflang="${alt}" href="${escapeXml(origin + localizeHref(entry.path, { locale: alt }))}" />`
				)
				.join('\n');

			return `  <url>
    <loc>${escapeXml(origin + localizeHref(entry.path, { locale }))}</loc>
${alternates}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>${
			entry.lastmod ? `\n    <lastmod>${entry.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''
		}
  </url>`;
		})
	);

	setHeaders({
		'content-type': 'application/xml',
		'cache-control': 'public, max-age=3600'
	});

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>`
	);
};
