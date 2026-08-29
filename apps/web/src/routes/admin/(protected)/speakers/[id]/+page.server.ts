import { adminApi } from '$lib/server/admin';
import { formValues, toAdminFailure, translationPathMapper, zodFail } from '$lib/server/form';
import { parseSpeakerForm } from '$lib/server/parse-admin-forms';
import { isDomainError, speakerInputSchema, type RichTextDoc } from '@awsug/shared';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminSpeakerDetail {
	id: string;
	slug: string;
	photoUrl: string | null;
	company: string | null;
	communityRole: 'none' | 'leader' | 'co_leader' | 'organiser';
	sortOrder: number;
	websiteUrl: string | null;
	linkedinUrl: string | null;
	githubUrl: string | null;
	translations: {
		locale: 'lo' | 'en';
		name: string;
		title: string | null;
		bio: RichTextDoc | null;
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
		const data = await request.formData();
		const values = formValues(data);
		const input = parseSpeakerForm(data);

		const parsed = speakerInputSchema.safeParse(input);
		if (!parsed.success) {
			return zodFail(parsed.error, values, { mapPath: translationPathMapper(input) });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/speakers/${params.id}`, parsed.data);
		} catch (error_) {
			return toAdminFailure(error_, values);
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
