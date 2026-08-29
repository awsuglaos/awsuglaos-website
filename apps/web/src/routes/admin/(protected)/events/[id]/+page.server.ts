import { adminApi } from '$lib/server/admin';
import { formValues, toAdminFailure, translationPathMapper, zodFail } from '$lib/server/form';
import { parseEventForm } from '$lib/server/parse-admin-forms';
import {
	eventInputSchema,
	isDomainError,
	type FormDefinition,
	type RichTextDoc
} from '@awsug/shared';
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
	requiresApproval: boolean;
	status: 'draft' | 'published';
	/*
	 * `getEventById` returns the whole event row, so the form definition has
	 * always come back with it. Declared because the registrants panel needs it
	 * to know what each answer was a reply to — an answers map on its own is a
	 * bag of ids.
	 */
	formSchema: FormDefinition;
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
		const data = await request.formData();
		const values = formValues(data);
		const input = parseEventForm(data);

		const parsed = eventInputSchema.safeParse(input);
		if (!parsed.success) {
			return zodFail(parsed.error, values, { mapPath: translationPathMapper(input) });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/events/${params.id}`, parsed.data);
		} catch (error_) {
			return toAdminFailure(error_, values);
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
