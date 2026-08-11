import { getContext } from '$lib/server/context';
import { newsletterService } from '@awsug/core';
import { isDomainError } from '@awsug/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	if (!token) return { ok: false };

	try {
		const ctx = await getContext();
		await newsletterService.unsubscribe(ctx, token);
		return { ok: true };
	} catch (error) {
		// An unknown or already-used token is not worth an error page — the reader
		// only cares that they will stop receiving mail.
		if (isDomainError(error)) return { ok: false };
		throw error;
	}
};
