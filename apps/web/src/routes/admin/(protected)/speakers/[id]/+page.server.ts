import { adminApi } from '$lib/server/admin';
import { parseSpeakerForm } from '$lib/server/parse-admin-forms';
import { isDomainError, speakerInputSchema } from '@awsug/shared';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminSpeakerDetail {
	id: string;
	slug: string;
	photoUrl: string | null;
	company: string | null;
	websiteUrl: string | null;
	linkedinUrl: string | null;
	githubUrl: string | null;
	translations: {
		locale: 'lo' | 'en';
		name: string;
		title: string | null;
		bio: string | null;
	}[];
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	try {
		return {
			speaker: await adminApi(cookies, fetch).get<AdminSpeakerDetail>(
				`/admin/speakers/${params.id}`
			)
		};
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Speaker not found');
		throw err;
	}
};

export const actions: Actions = {
	save: async ({ request, params, cookies, fetch }) => {
		const parsed = speakerInputSchema.safeParse(parseSpeakerForm(await request.formData()));
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues.map((i) => i.message).join('. ') });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/speakers/${params.id}`, parsed.data);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}

		return { message: 'Saved.' };
	},

	delete: async ({ params, cookies, fetch }) => {
		try {
			await adminApi(cookies, fetch).del(`/admin/speakers/${params.id}`);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		redirect(303, '/admin/speakers');
	}
};
