import { isAllowedImageType, MAX_UPLOAD_BYTES, type PresignedUpload } from '@awsug/shared';

/**
 * Two-step upload: ask our server to sign a destination, then PUT the bytes
 * straight there. The file never passes through SvelteKit or Lambda.
 *
 * The presign call goes to a SvelteKit endpoint rather than the API directly,
 * so the admin's access token stays in its httpOnly cookie and is attached
 * server-side.
 */
export async function uploadImage(file: File): Promise<string> {
	if (!isAllowedImageType(file.type)) {
		throw new Error('Images only: JPEG, PNG, WebP, AVIF or GIF');
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		throw new Error(`Images must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`);
	}

	const presignResponse = await fetch('/admin/uploads', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ contentType: file.type, contentLength: file.size })
	});

	if (!presignResponse.ok) {
		const detail = await presignResponse.json().catch(() => null);
		throw new Error(detail?.message ?? 'Could not prepare the upload');
	}

	const presigned: PresignedUpload = await presignResponse.json();

	const uploadResponse = await fetch(presigned.uploadUrl, {
		method: 'PUT',
		headers: presigned.headers,
		body: file
	});

	if (!uploadResponse.ok) {
		throw new Error(`Upload failed (${uploadResponse.status})`);
	}

	return presigned.publicUrl;
}
