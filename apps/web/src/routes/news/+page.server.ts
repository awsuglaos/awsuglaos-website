import { getLocale } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { articleService } from '@awsug/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const ctx = await getContext();
	const locale = getLocale();

	const search = url.searchParams.get('q')?.trim() ?? '';
	const category = url.searchParams.get('category')?.trim() ?? '';

	const [articles, categories] = await Promise.all([
		articleService.listPublishedArticles(ctx, {
			locale,
			...(search ? { search } : {}),
			...(category ? { category } : {})
		}),
		articleService.listCategories(ctx)
	]);

	// Search results vary per query string; only cache the unfiltered listing.
	if (!search && !category) {
		setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=600' });
	}

	return { articles, categories, search, category };
};
