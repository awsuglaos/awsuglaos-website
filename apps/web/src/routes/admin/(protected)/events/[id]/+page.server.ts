import { adminApi } from '$lib/server/admin';
import { parseEventForm } from '$lib/server/parse-admin-forms';
import { eventInputSchema, isDomainError, type RichTextDoc } from '@awsug/shared';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminEventDetail {
	id: string;
	slug: string;
	startAt: string;
	endAt: string;
	capacity: number;
	registeredCount: number;
	locationUrl: string;
	coverImageUrl: string | null;
	status: 'draft' | 'published';
	translations: {
		locale: 'lo' | 'en';
		title: string;
		description: RichTextDoc;
		locationName: string;
	}[];
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	try {
		return {
			event: await adminApi(cookies, fetch).get<AdminEventDetail>(`/admin/events/${params.id}`)
		};
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};

export const actions: Actions = {
	save: async ({ request, params, cookies, fetch }) => {
		const parsed = eventInputSchema.safeParse(parseEventForm(await request.formData()));
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues.map((i) => i.message).join('. ') });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/events/${params.id}`, parsed.data);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}

		return { message: 'Saved.' };
	},

	delete: async ({ params, cookies, fetch }) => {
		try {
			await adminApi(cookies, fetch).del(`/admin/events/${params.id}`);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		redirect(303, '/admin/events');
	}
};
