import { adminApi } from '$lib/server/admin';
import { field } from '$lib/server/form';
import { inviteUserInputSchema, isDomainError, userRoleSchema } from '@awsug/shared';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminUser {
	id: string;
	email: string;
	name: string;
	avatarUrl: string | null;
	role: 'admin' | 'editor';
	cognitoSub: string | null;
	createdAt: string;
}

export const load: PageServerLoad = async ({ cookies, fetch }) => ({
	users: await adminApi(cookies, fetch).get<AdminUser[]>('/admin/users')
});

export const actions: Actions = {
	invite: async ({ request, cookies, fetch }) => {
		const data = await request.formData();
		const parsed = inviteUserInputSchema.safeParse({
			email: field(data, 'email'),
			name: field(data, 'name'),
			role: field(data, 'role')
		});

		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Check the details' });
		}

		try {
			await adminApi(cookies, fetch).post('/admin/users', parsed.data);
		} catch (error) {
			if (isDomainError(error)) return fail(error.status, { message: error.message });
			throw error;
		}

		return { message: `Invited ${parsed.data.email}.` };
	},

	role: async ({ request, cookies, fetch }) => {
		const data = await request.formData();
		const id = field(data, 'id');
		const role = userRoleSchema.safeParse(field(data, 'role'));
		if (!id || !role.success) return fail(400, { message: 'Invalid request' });

		try {
			await adminApi(cookies, fetch).put(`/admin/users/${id}/role`, { role: role.data });
		} catch (error) {
			// The server refuses self-demotion and removing the last admin; surface
			// its wording rather than inventing our own.
			if (isDomainError(error)) return fail(error.status, { message: error.message });
			throw error;
		}

		return { message: 'Role updated.' };
	},

	remove: async ({ request, cookies, fetch }) => {
		const id = field(await request.formData(), 'id');
		if (!id) return fail(400, { message: 'Invalid request' });

		try {
			await adminApi(cookies, fetch).del(`/admin/users/${id}`);
		} catch (error) {
			if (isDomainError(error)) return fail(error.status, { message: error.message });
			throw error;
		}

		return { message: 'User removed.' };
	}
};
