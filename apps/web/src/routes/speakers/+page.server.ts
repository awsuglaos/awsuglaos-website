import { getContext } from '$lib/server/context';
import { localeOf } from '$lib/server/locale';
import { speakerService } from '@awsug/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const ctx = await getContext();
	const speakers = await speakerService.listPublicSpeakers(ctx, { locale: localeOf(url) });

	// The directory changes when someone is added or promoted, which is rare.
	setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });

	return { speakers };
};
