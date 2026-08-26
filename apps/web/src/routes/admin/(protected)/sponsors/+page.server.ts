import { adminApi } from '$lib/server/admin';
import { field, formValues, toAdminFailure, zodFail } from '$lib/server/form';
import { parseSponsorForm } from '$lib/server/parse-admin-forms';
import { isDomainError, sponsorInputSchema } from '@awsug/shared';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminSponsor {
	id: string;
	name: string;
	logoUrl: string;
	websiteUrl: string | null;
	tier: 'platinum' | 'gold' | 'silver' | 'community';
	sortOrder: number;
}

export const load: PageServerLoad = async ({ cookies, fetch }) => ({
	sponsors: await adminApi(cookies, fetch).get<AdminSponsor[]>('/admin/sponsors')
});

export const actions: Actions = {
	create: async ({ request, cookies, fetch }) => {
		const data = await request.formData();
		const values = formValues(data);

		const parsed = sponsorInputSchema.safeParse(parseSponsorForm(data));
		if (!parsed.success) return zodFail(parsed.error, values);

		try {
			await adminApi(cookies, fetch).post('/admin/sponsors', parsed.data);
		} catch (error) {
			return toAdminFailure(error, values);
		}

		return { message: 'Sponsor added.' };
	},

	delete: async ({ request, cookies, fetch }) => {
		const id = field(await request.formData(), 'id');
		if (!id) return fail(400, { message: 'Missing sponsor id' });

		try {
			await adminApi(cookies, fetch).del(`/admin/sponsors/${id}`);
		} catch (error) {
			if (isDomainError(error)) return fail(400, { message: error.message });
			throw error;
		}

		return { message: 'Sponsor removed.' };
	}
};
