import { getLocale } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { speakerService } from '@awsug/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	const ctx = await getContext();
	const speakers = await speakerService.listPublicSpeakers(ctx, { locale: getLocale() });

	// The directory changes when someone is added or promoted, which is rare.
	setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });

	return { speakers };
};
