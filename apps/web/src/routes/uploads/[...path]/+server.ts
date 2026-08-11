import { localUploadStore, usingLocalUploads } from '$lib/server/context';
import { readSession } from '$lib/server/session';
import { isAllowedImageType, MAX_UPLOAD_BYTES } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { RequestHandler } from './$types';

const CONTENT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	avif: 'image/avif',
	gif: 'image/gif'
};

/**
 * Stands in for S3 when no bucket is configured.
 *
 * Once UPLOADS_BUCKET is set — which it always is on a deployed stage — both
 * handlers disappear: the browser PUTs straight to the bucket and CloudFront
 * serves the objects. Gating on the bucket rather than on `dev` matters,
 * because `vite preview` runs a production build against local storage and
 * would otherwise refuse every upload.
 */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	if (!usingLocalUploads()) error(404, 'Not found');
	// Writing still requires a signed-in admin session.
	if (!readSession(cookies)) error(401, 'Sign in first');

	const contentType = request.headers.get('content-type') ?? '';
	if (!isAllowedImageType(contentType)) error(415, 'Unsupported image type');

	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0) error(400, 'Empty upload');
	if (bytes.byteLength > MAX_UPLOAD_BYTES) error(413, 'Image is too large');

	// The route sits at /uploads, so `params.path` is the key minus that prefix.
	// `write` refuses anything that would escape the upload root.
	await localUploadStore().write(params.path, bytes);

	return new Response(null, { status: 200 });
};

export const GET: RequestHandler = async ({ params }) => {
	if (!usingLocalUploads()) error(404, 'Not found');

	const store = localUploadStore();
	let filePath: string;
	try {
		filePath = store.pathFor(params.path);
	} catch {
		error(400, 'Bad path');
	}

	const info = await stat(filePath).catch(() => null);
	if (!info?.isFile()) error(404, 'Not found');

	const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
	const stream = createReadStream(filePath) as unknown as ReadableStream;

	return new Response(stream, {
		headers: {
			'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
			'content-length': String(info.size),
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
