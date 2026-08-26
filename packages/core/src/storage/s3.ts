import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignedUpload, PresignUploadInput } from '@awsug/shared';
import { buildObjectKey, type ObjectStore } from './types.js';

export interface S3StorageConfig {
	bucket: string;
	/**
	 * Only set this when objects are served from a *different* host than the
	 * site. Left empty, the public URL is site-relative — which is what you want
	 * when CloudFront serves /uploads/* from the site's own distribution, and
	 * means a domain change does not strand every image already in the database.
	 */
	publicBaseUrl?: string;
	/** Seconds the presigned PUT stays valid. Short: it is used immediately. */
	expiresIn?: number;
}

export class S3ObjectStore implements ObjectStore {
	private readonly client: S3Client;

	constructor(
		private readonly config: S3StorageConfig,
		client?: S3Client
	) {
		this.client = client ?? new S3Client({});
	}

	async presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
		const key = buildObjectKey(input.contentType);

		/*
		 * Documents are stored with `Content-Disposition: attachment`, so the
		 * browser saves them instead of rendering them.
		 *
		 * This is a safety property, not a preference. The bucket is served from
		 * the site's own origin, so anything the browser renders inline runs *as*
		 * awsug.la and could read an admin's session. The type allowlist in
		 * packages/shared/src/upload.ts is the first defence and already excludes
		 * everything script-bearing; this is the second, and it holds even if that
		 * list is later widened by someone who has not thought it through.
		 *
		 * Images stay inline — they are meant to be displayed, and none of the
		 * permitted image types can script.
		 *
		 * It has to be signed *and* echoed in `headers`: a header that is part of
		 * the signature but missing from the PUT makes the signature fail.
		 */
		const asAttachment = input.purpose === 'document';

		const uploadUrl = await getSignedUrl(
			this.client,
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: key,
				ContentType: input.contentType,
				// Signing the length as well means an oversized body is rejected by S3
				// itself, not merely discouraged by our own size check.
				ContentLength: input.contentLength,
				...(asAttachment ? { ContentDisposition: 'attachment' } : {})
			}),
			{ expiresIn: this.config.expiresIn ?? 300 }
		);

		return {
			uploadUrl,
			publicUrl: this.config.publicBaseUrl
				? `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`
				: `/${key}`,
			key,
			headers: {
				'content-type': input.contentType,
				'content-length': String(input.contentLength),
				...(asAttachment ? { 'content-disposition': 'attachment' } : {})
			}
		};
	}
}
