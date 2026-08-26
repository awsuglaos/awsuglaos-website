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

/**
 * Event materials: slide decks, handouts, demo archives.
 *
 * Every entry here is inert in a browser. That is not an accident and not
 * merely tidy — the uploads bucket is served from the site's own origin
 * (awsug.la/uploads/*), so a file that executes script runs *as the site* and
 * can read an admin's session cookie. `text/html`, `image/svg+xml`,
 * `application/xml` and anything else script-bearing are therefore absent by
 * design. PDFs render inline, which is wanted and safe; they cannot script the
 * embedding origin.
 *
 * Adding a type here is a security decision, not a convenience one.
 */
export const ALLOWED_DOCUMENT_TYPES = [
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
	'application/vnd.ms-powerpoint', // .ppt
	'application/vnd.apple.keynote', // .key
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
	'application/msword', // .doc
	'application/zip',
	'text/csv',
	'text/plain',
	'text/markdown'
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

/** What an upload is for. Decides both the allowlist and the size ceiling. */
export const UPLOAD_PURPOSES = ['image', 'document'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/**
 * @deprecated Prefer MAX_IMAGE_BYTES. Kept so existing image callers read the
 * same value they always did.
 */
export const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES;

const EXTENSIONS: Record<AllowedImageType | AllowedDocumentType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif',
	'application/pdf': 'pdf',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.apple.keynote': 'key',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/msword': 'doc',
	'application/zip': 'zip',
	'text/csv': 'csv',
	'text/plain': 'txt',
	'text/markdown': 'md'
};

export function extensionFor(contentType: string): string {
	return EXTENSIONS[contentType as AllowedImageType | AllowedDocumentType] ?? 'bin';
}

export function isAllowedImageType(value: string): value is AllowedImageType {
	return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

export function isAllowedDocumentType(value: string): value is AllowedDocumentType {
	return (ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** The allowlist and ceiling that apply to a given purpose. */
export function uploadLimitsFor(purpose: UploadPurpose): {
	maxBytes: number;
	isAllowed: (value: string) => boolean;
} {
	return purpose === 'document'
		? { maxBytes: MAX_DOCUMENT_BYTES, isAllowed: isAllowedDocumentType }
		: { maxBytes: MAX_IMAGE_BYTES, isAllowed: isAllowedImageType };
}

const megabytes = (bytes: number) => Math.floor(bytes / 1024 / 1024);

/**
 * `purpose` defaults to 'image' so every caller that predates event materials
 * keeps working untouched, and so a request that simply forgets the field lands
 * on the *stricter* of the two rules rather than the looser one.
 */
export const presignUploadInputSchema = z
	.object({
		purpose: z.enum(UPLOAD_PURPOSES).default('image'),
		contentType: z.string(),
		contentLength: z.coerce.number().int().positive('File is empty')
	})
	.superRefine((input, ctx) => {
		const { maxBytes, isAllowed } = uploadLimitsFor(input.purpose);

		if (!isAllowed(input.contentType)) {
			ctx.addIssue({
				code: 'custom',
				path: ['contentType'],
				message:
					input.purpose === 'document'
						? `Unsupported file type. Allowed: ${ALLOWED_DOCUMENT_TYPES.map(extensionFor).join(', ')}`
						: `Images only: ${ALLOWED_IMAGE_TYPES.map(extensionFor).join(', ')}`
			});
		}

		if (input.contentLength > maxBytes) {
			ctx.addIssue({
				code: 'custom',
				path: ['contentLength'],
				message: `${input.purpose === 'document' ? 'Files' : 'Images'} must be under ${megabytes(maxBytes)}MB`
			});
		}
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
