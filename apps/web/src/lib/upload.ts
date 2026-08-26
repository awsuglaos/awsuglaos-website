import {
	uploadLimitsFor,
	extensionFor,
	ALLOWED_DOCUMENT_TYPES,
	ALLOWED_IMAGE_TYPES,
	type PresignedUpload,
	type UploadPurpose
} from '@awsug/shared';

/**
 * Two-step upload: ask our server to sign a destination, then PUT the bytes
 * straight there. The file never passes through SvelteKit or Lambda.
 *
 * The presign call goes to a SvelteKit endpoint rather than the API directly,
 * so the admin's access token stays in its httpOnly cookie and is attached
 * server-side.
 */
export async function uploadFile(file: File, purpose: UploadPurpose = 'image'): Promise<string> {
	const { maxBytes, isAllowed } = uploadLimitsFor(purpose);

	// Checked here purely to fail fast with a readable message; the server
	// applies the same rules and is the one that actually matters.
	if (!isAllowed(file.type)) {
		const allowed = (purpose === 'document' ? ALLOWED_DOCUMENT_TYPES : ALLOWED_IMAGE_TYPES)
			.map(extensionFor)
			.join(', ');
		return Promise.reject(new Error(`Unsupported file type. Allowed: ${allowed}`));
	}
	if (file.size > maxBytes) {
		const limit = Math.floor(maxBytes / 1024 / 1024);
		return Promise.reject(new Error(`File must be under ${limit}MB`));
	}

	const presignResponse = await fetch('/admin/uploads', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ contentType: file.type, contentLength: file.size, purpose })
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

/** Unchanged entry point for every image field that predates event materials. */
export async function uploadImage(file: File): Promise<string> {
	return uploadFile(file, 'image');
}

/**
 * Uploads a batch, a few at a time.
 *
 * Serialising would make a gallery of twenty photos feel broken; firing all of
 * them at once opens twenty parallel PUTs, which on a Lao mobile connection is
 * how you get timeouts rather than speed. Three is a compromise that keeps the
 * progress bar moving.
 *
 * One file failing must not lose the rest, so results come back per file and
 * the caller decides what to say about the failures.
 */
export async function uploadAll(
	files: File[],
	purpose: UploadPurpose,
	onProgress?: (done: number, total: number) => void
): Promise<{ file: File; url?: string; error?: string }[]> {
	const results: { file: File; url?: string; error?: string }[] = new Array(files.length);
	let done = 0;
	let next = 0;

	async function worker() {
		while (next < files.length) {
			const index = next++;
			const file = files[index]!;
			try {
				results[index] = { file, url: await uploadFile(file, purpose) };
			} catch (error) {
				results[index] = { file, error: error instanceof Error ? error.message : 'Upload failed' };
			}
			onProgress?.(++done, files.length);
		}
	}

	await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
	return results;
}
