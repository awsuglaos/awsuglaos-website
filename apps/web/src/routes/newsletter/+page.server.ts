import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { getContext } from '$lib/server/context';
import { field, isBot } from '$lib/server/form';
import { newsletterService } from '@awsug/core';
import { newsletterInputSchema } from '@awsug/shared';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	subscribe: async ({ request }) => {
		const data = await request.formData();

		if (isBot(data)) {
			return { message: m.newsletter_success() };
		}

		const parsed = newsletterInputSchema.safeParse({
			email: field(data, 'email'),
			locale: getLocale()
		});

		if (!parsed.success) {
			return fail(400, {
				message: parsed.error.issues[0]?.message ?? m.newsletter_error()
			});
		}

		try {
			const ctx = await getContext();
			await newsletterService.subscribe(ctx, parsed.data);
			return { message: m.newsletter_success() };
		} catch (error) {
			console.error('Newsletter subscribe failed', error);
			return fail(500, { message: m.newsletter_error() });
		}
	}
};
