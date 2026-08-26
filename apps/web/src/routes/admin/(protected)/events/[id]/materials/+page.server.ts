import { adminApi } from '$lib/server/admin';
import { parseEventPhotosForm, parseEventResourcesForm } from '$lib/server/parse-admin-forms';
import {
	isDomainError,
	setEventPhotosInputSchema,
	setEventResourcesInputSchema,
	type ResourceKind
} from '@awsug/shared';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface ResourceRow {
	id: string;
	title: string;
	kind: ResourceKind;
	url: string;
	sizeBytes: number | null;
	contentType: string | null;
	sortOrder: number;
}

export interface PhotoRow {
	id: string;
	url: string;
	caption: string | null;
	sortOrder: number;
}

interface EventSummary {
	id: string;
	slug: string;
	endAt: string;
	translations: { locale: string; title: string }[];
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const client = adminApi(cookies, fetch);

	try {
		const [event, resources, photos] = await Promise.all([
			client.get<EventSummary>(`/admin/events/${params.id}`),
			client.get<ResourceRow[]>(`/admin/events/${params.id}/resources`),
			client.get<PhotoRow[]>(`/admin/events/${params.id}/photos`)
		]);

		return { event, resources, photos };
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};

export const actions: Actions = {
	resources: async ({ request, params, cookies, fetch }) => {
		const parsed = setEventResourcesInputSchema.safeParse(
			parseEventResourcesForm(await request.formData())
		);
		// Surface the field-level message rather than a generic one: "Upload a
		// file or paste a link" tells the editor which row to fix.
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Could not save resources' });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/events/${params.id}/resources`, parsed.data);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		return { message: 'Resources saved.' };
	},

	photos: async ({ request, params, cookies, fetch }) => {
		const parsed = setEventPhotosInputSchema.safeParse(
			parseEventPhotosForm(await request.formData())
		);
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Could not save photos' });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/events/${params.id}/photos`, parsed.data);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		return { message: 'Photos saved.' };
	}
};
