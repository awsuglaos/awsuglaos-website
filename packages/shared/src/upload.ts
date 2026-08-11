import { z } from 'zod';

/**
 * Upload rules live here so the browser, the API and the storage adapters all
 * enforce the same limits. The browser check is a courtesy — the server repeats
 * it, because a presigned URL handed out on bad input is a hole in the bucket.
 */
export const ALLOWED_IMAGE_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif'
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<AllowedImageType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif'
};

export function extensionFor(contentType: string): string {
	return EXTENSIONS[contentType as AllowedImageType] ?? 'bin';
}

export function isAllowedImageType(value: string): value is AllowedImageType {
	return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

export const presignUploadInputSchema = z.object({
	contentType: z
		.string()
		.refine(isAllowedImageType, `Images only: ${ALLOWED_IMAGE_TYPES.join(', ')}`),
	contentLength: z.coerce
		.number()
		.int()
		.positive('File is empty')
		.max(MAX_UPLOAD_BYTES, `Images must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`)
});

export type PresignUploadInput = z.infer<typeof presignUploadInputSchema>;

export interface PresignedUpload {
	/** Where the browser PUTs the bytes. */
	uploadUrl: string;
	/** Where the object will be readable once uploaded. */
	publicUrl: string;
	key: string;
	/** Headers the PUT must send for the signature to match. */
	headers: Record<string, string>;
}
