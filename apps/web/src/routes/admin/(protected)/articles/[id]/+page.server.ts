import { adminApi } from '$lib/server/admin';
import { formValues, toAdminFailure, translationPathMapper, zodFail } from '$lib/server/form';
import { parseArticleForm } from '$lib/server/parse-admin-forms';
import { articleInputSchema, isDomainError, type RichTextDoc } from '@awsug/shared';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminArticleDetail {
	id: string;
	slug: string;
	category: string | null;
	coverImageUrl: string | null;
	status: 'draft' | 'published';
	publishedAt: string | null;
	translations: {
		locale: 'lo' | 'en';
		title: string;
		excerpt: string | null;
		content: RichTextDoc;
	}[];
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	try {
		return {
			article: await adminApi(cookies, fetch).get<AdminArticleDetail>(
				`/admin/articles/${params.id}`
			)
		};
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Article not found');
		throw err;
	}
};

export const actions: Actions = {
	save: async ({ request, params, cookies, fetch }) => {
		const data = await request.formData();
		const values = formValues(data);
		const input = parseArticleForm(data);

		const parsed = articleInputSchema.safeParse(input);
		if (!parsed.success) {
			return zodFail(parsed.error, values, { mapPath: translationPathMapper(input) });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/articles/${params.id}`, parsed.data);
		} catch (error_) {
			return toAdminFailure(error_, values);
		}

		return { message: 'Saved.' };
	},

	delete: async ({ params, cookies, fetch }) => {
		try {
			await adminApi(cookies, fetch).del(`/admin/articles/${params.id}`);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		redirect(303, '/admin/articles');
	}
};
