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

		const uploadUrl = await getSignedUrl(
			this.client,
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: key,
				ContentType: input.contentType,
				// Signing the length as well means an oversized body is rejected by S3
				// itself, not merely discouraged by our own size check.
				ContentLength: input.contentLength
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
				'content-length': String(input.contentLength)
			}
		};
	}
}
