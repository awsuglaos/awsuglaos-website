import { getLocale } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { speakerService } from '@awsug/core';
import { isDomainError } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const ctx = await getContext();

	try {
		const speaker = await speakerService.getSpeakerBySlug(ctx, params.slug, getLocale());
		setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
		return { speaker };
	} catch (err) {
		if (isDomainError(err) && err.code === 'not_found') error(404, 'Speaker not found');
		throw err;
	}
};
