import { adminApi } from '$lib/server/admin';
import { field } from '$lib/server/form';
import { isDomainError, updateUserProfileInputSchema, userRoleSchema } from '@awsug/shared';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export interface AdminUserDetail {
	id: string;
	email: string;
	name: string;
	avatarUrl: string | null;
	role: 'admin' | 'editor';
	cognitoSub: string | null;
	createdAt: string;
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	try {
		return {
			user: await adminApi(cookies, fetch).get<AdminUserDetail>(`/admin/users/${params.id}`)
		};
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'User not found');
		throw err;
	}
};

export const actions: Actions = {
	profile: async ({ request, params, cookies, fetch }) => {
		const data = await request.formData();
		const parsed = updateUserProfileInputSchema.safeParse({
			name: field(data, 'name'),
			avatarUrl: field(data, 'avatarUrl') ?? ''
		});

		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Check the details' });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/users/${params.id}/profile`, parsed.data);
		} catch (err) {
			if (isDomainError(err)) return fail(err.status, { message: err.message });
			throw err;
		}

		return { message: 'Saved.' };
	},

	role: async ({ request, params, cookies, fetch }) => {
		const role = userRoleSchema.safeParse(field(await request.formData(), 'role'));
		if (!role.success) return fail(400, { message: 'Invalid role' });

		try {
			await adminApi(cookies, fetch).put(`/admin/users/${params.id}/role`, { role: role.data });
		} catch (err) {
			// The API refuses self-demotion and removing the last admin; show its
			// wording rather than inventing our own.
			if (isDomainError(err)) return fail(err.status, { message: err.message });
			throw err;
		}

		return { message: 'Role updated.' };
	},

	delete: async ({ params, cookies, fetch }) => {
		try {
			await adminApi(cookies, fetch).del(`/admin/users/${params.id}`);
		} catch (err) {
			if (isDomainError(err)) return fail(err.status, { message: err.message });
			throw err;
		}
		redirect(303, '/admin/users');
	}
};
