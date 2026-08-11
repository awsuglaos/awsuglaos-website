import { env } from '$env/dynamic/private';
import { DomainError, type DomainErrorCode } from '@awsug/shared';

const BASE = () => (env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

interface ApiErrorBody {
	error?: string;
	message?: string;
	issues?: { path: string; message: string }[];
}

/**
 * Server-to-server client for the Hono API.
 *
 * The backoffice never calls this from the browser: pages load and mutate
 * through SvelteKit, which forwards the token from an httpOnly cookie. That
 * keeps the access token out of client JavaScript entirely and means no CORS
 * preflight on the admin path.
 */
export function api(token: string, fetchFn: typeof fetch = fetch) {
	async function request<T>(method: string, path: string, payload?: unknown): Promise<T> {
		const response = await fetchFn(`${BASE()}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				...(payload === undefined ? {} : { 'content-type': 'application/json' })
			},
			...(payload === undefined ? {} : { body: JSON.stringify(payload) })
		});

		if (response.status === 204) return undefined as T;

		if (!response.ok) {
			let body: ApiErrorBody = {};
			try {
				body = (await response.json()) as ApiErrorBody;
			} catch {
				// Non-JSON error body (a gateway timeout, say) — fall through.
			}
			const detail = body.issues?.map((i) => `${i.path}: ${i.message}`).join('; ');
			throw new DomainError(
				(body.error as DomainErrorCode) ?? 'validation_failed',
				detail ? `${body.message ?? 'Request failed'} (${detail})` : (body.message ?? 'Request failed'),
				response.status
			);
		}

		return (await response.json()) as T;
	}

	return {
		get: <T>(path: string) => request<T>('GET', path),
		post: <T>(path: string, payload: unknown) => request<T>('POST', path, payload),
		put: <T>(path: string, payload: unknown) => request<T>('PUT', path, payload),
		del: (path: string) => request<void>('DELETE', path),
		/** Raw passthrough, used to stream the CSV export without buffering it. */
		raw: (path: string) =>
			fetchFn(`${BASE()}${path}`, { headers: { authorization: `Bearer ${token}` } })
	};
}

export type ApiClient = ReturnType<typeof api>;
