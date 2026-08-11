import { extensionFor, type PresignedUpload, type PresignUploadInput } from '@awsug/shared';
import { ulid } from 'ulid';

/**
 * Where uploaded images live.
 *
 * Uploads are *presigned*, never proxied: the browser PUTs directly to storage.
 * API Gateway caps a request body at 10MB and Lambda at 6MB, so routing an
 * 8MB photo through the function would fail outright — and even a small one
 * would burn Lambda time moving bytes it has no reason to look at.
 */
export interface ObjectStore {
	presignUpload(input: PresignUploadInput): Promise<PresignedUpload>;
}

/**
 * Date-partitioned keys with a ULID name. The prefix keeps a bucket listing
 * navigable years in; the ULID means two people uploading "logo.png" at the
 * same moment cannot overwrite each other.
 */
export function buildObjectKey(contentType: string, now = new Date()): string {
	const year = now.getUTCFullYear();
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	return `uploads/${year}/${month}/${ulid()}.${extensionFor(contentType)}`;
}
