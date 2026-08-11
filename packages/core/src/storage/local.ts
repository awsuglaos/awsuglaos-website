import type { PresignedUpload, PresignUploadInput } from '@awsug/shared';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { buildObjectKey, type ObjectStore } from './types.js';

export interface LocalStorageConfig {
	/** Directory on disk, e.g. `<repo>/.uploads`. */
	root: string;
}

/**
 * Filesystem stand-in for S3 so the whole upload path works with no AWS
 * account. There is nothing to presign locally, so the "upload URL" is a
 * SvelteKit endpoint that writes the bytes to disk — the browser still does a
 * plain PUT, so the client code is identical in both environments.
 */
export class LocalObjectStore implements ObjectStore {
	constructor(private readonly config: LocalStorageConfig) {}

	async presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
		/*
		 * Site-relative, deliberately. This API does not know which origin the
		 * browser is on — dev is :5173, `vite preview` is :4173 — and guessing
		 * from its own configuration sends the upload cross-origin, where it
		 * arrives without the session cookie and is refused by CORS.
		 *
		 * A relative URL resolves against whatever page is doing the upload, so it
		 * is correct on every port without configuration.
		 *
		 * The key already begins with `uploads/`, which is also the route prefix,
		 * so the path is "/" + key rather than "/uploads/" + key.
		 */
		const key = buildObjectKey(input.contentType);
		const url = `/${key}`;

		return {
			uploadUrl: url,
			publicUrl: url,
			key,
			headers: { 'content-type': input.contentType }
		};
	}

	/**
	 * Resolves a key to a path inside the upload root, refusing anything that
	 * escapes it. Without this check a key of `../../.env` would let a PUT write
	 * anywhere the dev server can reach.
	 */
	pathFor(key: string): string {
		const root = resolve(this.config.root);
		const target = resolve(join(root, normalize(key)));
		if (target !== root && !target.startsWith(root + sep)) {
			throw new Error(`Refusing to write outside the upload root: ${key}`);
		}
		return target;
	}

	async write(key: string, data: Uint8Array): Promise<void> {
		const target = this.pathFor(key);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, data);
	}
}
