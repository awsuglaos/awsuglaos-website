import { adminApi } from '$lib/server/admin';
import { parseSpeakerForm } from '$lib/server/parse-admin-forms';
import { isDomainError, speakerInputSchema } from '@awsug/shared';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, fetch }) => {
		const parsed = speakerInputSchema.safeParse(parseSpeakerForm(await request.formData()));
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues.map((i) => i.message).join('. ') });
		}

		let id: string;
		try {
			const created = await adminApi(cookies, fetch).post<{ id: string }>(
				'/admin/speakers',
				parsed.data
			);
			id = created.id;
		} catch (error) {
			if (isDomainError(error)) return fail(400, { message: error.message });
			throw error;
		}

		redirect(303, `/admin/speakers/${id}`);
	}
};
