import { adminApi } from '$lib/server/admin';
import { presignUploadInputSchema, type PresignedUpload } from '@awsug/shared';
import { isDomainError } from '@awsug/shared';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Signs an upload on the browser's behalf.
 *
 * This exists so the editor never needs the API token: the cookie is read here,
 * server-side, and the browser only ever sees the resulting presigned URL.
 */
export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
	const parsed = presignUploadInputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json(
			{ message: parsed.error.issues[0]?.message ?? 'Invalid upload request' },
			{ status: 400 }
		);
	}

	try {
		const presigned = await adminApi(cookies, fetch).post<PresignedUpload>(
			'/admin/uploads/presign',
			parsed.data
		);
		return json(presigned);
	} catch (error) {
		if (isDomainError(error)) {
			return json({ message: error.message }, { status: error.status });
		}
		throw error;
	}
};
