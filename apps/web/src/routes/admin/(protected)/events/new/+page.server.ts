import { adminApi } from '$lib/server/admin';
import { formValues, toAdminFailure, translationPathMapper, zodFail } from '$lib/server/form';
import { parseEventForm } from '$lib/server/parse-admin-forms';
import { eventInputSchema } from '@awsug/shared';
import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, fetch }) => {
		const data = await request.formData();
		const values = formValues(data);
		const input = parseEventForm(data);

		const parsed = eventInputSchema.safeParse(input);
		if (!parsed.success) {
			return zodFail(parsed.error, values, { mapPath: translationPathMapper(input) });
		}

		let id: string;
		try {
			const created = await adminApi(cookies, fetch).post<{ id: string }>(
				'/admin/events',
				parsed.data
			);
			id = created.id;
		} catch (error) {
			return toAdminFailure(error, values);
		}

		redirect(303, `/admin/events/${id}`);
	}
};
