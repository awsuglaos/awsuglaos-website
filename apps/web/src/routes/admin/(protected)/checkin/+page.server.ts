import { adminApi } from '$lib/server/admin';
import { field } from '$lib/server/form';
import { checkInInputSchema, isDomainError } from '@awsug/shared';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

interface CheckInResponse {
	ticketCode: string;
	fullName: string;
	checkedInAt: string;
	eventSlug: string;
}

export const actions: Actions = {
	default: async ({ request, cookies, fetch }) => {
		const data = await request.formData();
		const parsed = checkInInputSchema.safeParse({ ticketCode: field(data, 'ticketCode') });
		if (!parsed.success) return fail(400, { message: 'Enter a ticket code' });

		try {
			const result = await adminApi(cookies, fetch).post<CheckInResponse>('/checkin', parsed.data);
			return { ok: true as const, result };
		} catch (error) {
			if (isDomainError(error)) {
				return fail(error.status === 404 ? 404 : 409, {
					message: error.code === 'not_found' ? 'Unknown ticket code.' : error.message,
					code: error.code
				});
			}
			throw error;
		}
	}
};
