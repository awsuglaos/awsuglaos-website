import { adminApi } from '$lib/server/admin';
import { parseArticleForm } from '$lib/server/parse-admin-forms';
import { articleInputSchema, isDomainError } from '@awsug/shared';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, fetch }) => {
		const parsed = articleInputSchema.safeParse(parseArticleForm(await request.formData()));
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues.map((i) => i.message).join('. ') });
		}

		let id: string;
		try {
			const created = await adminApi(cookies, fetch).post<{ id: string }>(
				'/admin/articles',
				parsed.data
			);
			id = created.id;
		} catch (error) {
			if (isDomainError(error)) return fail(400, { message: error.message });
			throw error;
		}

		redirect(303, `/admin/articles/${id}`);
	}
};
