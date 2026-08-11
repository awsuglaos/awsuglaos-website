import * as m from '$lib/paraglide/messages';
import { isDomainError, type DomainErrorCode } from '@awsug/shared';
import { fail } from '@sveltejs/kit';

/** Reads a form field as a trimmed string, or undefined when blank. */
export function field(data: FormData, name: string): string | undefined {
	const value = data.get(name);
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

/**
 * A filled honeypot means a bot. Returning a plausible success rather than an
 * error denies it the signal that the field is what got it rejected.
 */
export function isBot(data: FormData): boolean {
	const trap = data.get('website');
	return typeof trap === 'string' && trap.trim() !== '';
}

const registrationMessages: Partial<Record<DomainErrorCode, () => string>> = {
	event_full: m.register_error_full,
	already_registered: m.register_error_duplicate,
	registration_closed: m.register_error_closed
};

/** Maps a domain error to a localized form failure. */
export function toFormFailure(error: unknown, fallback: () => string = m.register_error_generic) {
	if (isDomainError(error)) {
		const localized = registrationMessages[error.code];
		return fail(error.status === 404 ? 404 : 400, {
			message: localized ? localized() : fallback(),
			code: error.code
		});
	}

	console.error('Unhandled form action error', error);
	return fail(500, { message: fallback(), code: 'unknown' });
}
