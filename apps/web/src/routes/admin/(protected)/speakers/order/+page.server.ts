import { adminApi } from '$lib/server/admin';
import { parseSpeakerOrderForm } from '$lib/server/parse-admin-forms';
import { isDomainError, setSpeakerOrderInputSchema } from '@awsug/shared';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { AdminSpeaker } from '../+page.server';

export const load: PageServerLoad = async ({ cookies, fetch }) => ({
	// Already ordered role-first, sort order second — the board renders it as-is.
	speakers: await adminApi(cookies, fetch).get<AdminSpeaker[]>('/admin/speakers')
});

export const actions: Actions = {
	default: async ({ request, cookies, fetch }) => {
		const parsed = setSpeakerOrderInputSchema.safeParse(
			parseSpeakerOrderForm(await request.formData())
		);
		if (!parsed.success) return fail(400, { message: 'Could not save the order' });

		try {
			await adminApi(cookies, fetch).put('/admin/speakers/order', parsed.data);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		return { message: 'Order saved.' };
	}
};
