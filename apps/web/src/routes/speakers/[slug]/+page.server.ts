import { getContext } from '$lib/server/context';
import { localeOf } from '$lib/server/locale';
import { speakerService } from '@awsug/core';
import { isDomainError } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	const ctx = await getContext();

	try {
		const speaker = await speakerService.getSpeakerBySlug(ctx, params.slug, localeOf(url));
		setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
		return { speaker };
	} catch (err) {
		if (isDomainError(err) && err.code === 'not_found') error(404, 'Speaker not found');
		throw err;
	}
};
