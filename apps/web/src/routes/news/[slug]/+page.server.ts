import { getContext } from '$lib/server/context';
import { localeOf } from '$lib/server/locale';
import { articleService } from '@awsug/core';
import { isDomainError } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	const ctx = await getContext();

	try {
		const article = await articleService.getPublishedArticleBySlug(ctx, params.slug, localeOf(url));
		setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
		return { article };
	} catch (err) {
		if (isDomainError(err) && err.code === 'not_found') error(404, 'Article not found');
		throw err;
	}
};
