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

/* -------------------------------------------------------------------------- */
/* Validation failures                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every posted value, keyed by input name.
 *
 * This is what gets handed back to the page when validation fails, so the
 * browser re-renders what the editor actually typed rather than what was last
 * saved. Without it a bilingual event form — two titles, two venues and two
 * rich text documents — is wiped by a single malformed slug, which is the
 * single worst thing this backoffice used to do.
 *
 * Files are skipped: they cannot be re-populated into an <input type="file">
 * anyway, and the upload fields post a URL rather than bytes.
 */
export function formValues(data: FormData): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [name, value] of data.entries()) {
		if (typeof value === 'string' && !(name in values)) values[name] = value;
	}
	return values;
}

/*
 * Structural stand-ins for Zod's own types. `zod` is a dependency of
 * @awsug/shared rather than of this app — validation lives in one package on
 * purpose — and importing it here just to name a parameter would make the web
 * app depend on the validator directly. These shapes are all this module reads.
 */
interface IssueLike {
	readonly path: readonly PropertyKey[];
	readonly message: string;
}

export interface ValidationError {
	readonly issues: readonly IssueLike[];
}

/** Maps a Zod issue path to the name of the input that produced it. */
export type PathMapper = (path: readonly PropertyKey[]) => string;

/** `Array.join` throws on a symbol key, and Zod's path type permits one. */
const segment = (key: PropertyKey): string =>
	typeof key === 'symbol' ? (key.description ?? '') : String(key);

const joinPath: PathMapper = (path) => path.map(segment).join('.');

export interface ValidationFailure {
	message: string;
	/** Keyed by input name, for `aria-invalid` and an inline message. */
	fieldErrors: Record<string, string>;
	/** Issues that belong to the form as a whole rather than to one input. */
	formErrors: string[];
	values: Record<string, string>;
}

/**
 * Turns a Zod failure into something a form can render.
 *
 * The old behaviour joined every message into one sentence at the top of the
 * page and marked nothing, so finding the offending field in a form several
 * screens long was a hunt. Now each issue is attached to its input and the
 * banner only carries what could not be — a cross-field rule like "end time
 * must be after the start time" has nowhere else to go.
 */
export function zodFail(
	error: ValidationError,
	values: Record<string, string>,
	options: { mapPath?: PathMapper; status?: number } = {}
) {
	const mapPath = options.mapPath ?? joinPath;

	const fieldErrors: Record<string, string> = {};
	const formErrors: string[] = [];

	for (const issue of error.issues) {
		if (issue.path.length === 0) {
			formErrors.push(issue.message);
			continue;
		}
		const key = mapPath(issue.path);
		// First issue per field wins: the rest are usually the same problem seen
		// through a second refinement.
		if (!fieldErrors[key]) fieldErrors[key] = issue.message;
	}

	const marked = Object.keys(fieldErrors).length;
	const message =
		formErrors.length > 0
			? formErrors.join('. ')
			: marked === 1
				? 'Nothing was saved — one field needs attention.'
				: `Nothing was saved — ${marked} fields need attention.`;

	return fail(options.status ?? 400, {
		message,
		fieldErrors,
		formErrors,
		values
	} satisfies ValidationFailure);
}

/**
 * The bilingual forms post `title_lo` / `title_en`, but Zod reports
 * `translations.0.title`. The index is not the locale — `parseEventForm` drops
 * languages left blank — so the locale is read back out of the parsed input
 * rather than assumed.
 */
export function translationPathMapper(input: {
	translations?: readonly { locale: string }[];
}): PathMapper {
	return (path) => {
		if (path[0] === 'translations' && typeof path[1] === 'number' && path.length >= 3) {
			const locale = input.translations?.[path[1]]?.locale;
			if (locale) return `${segment(path[2]!)}_${locale}`;
		}
		return joinPath(path);
	};
}

/* -------------------------------------------------------------------------- */
/* Domain errors                                                              */
/* -------------------------------------------------------------------------- */

const registrationMessages: Partial<Record<DomainErrorCode, () => string>> = {
	event_full: m.register_error_full,
	already_registered: m.register_error_duplicate,
	registration_closed: m.register_error_closed,
	registration_not_approved: m.register_error_not_approved
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

/**
 * The same, for the backoffice: an API rejection carries a usable message
 * already, and the submitted values still have to survive it.
 */
export function toAdminFailure(error: unknown, values: Record<string, string>) {
	if (isDomainError(error)) {
		return fail(error.status === 404 ? 404 : 400, {
			message: error.message,
			fieldErrors: {},
			formErrors: [error.message],
			values
		} satisfies ValidationFailure);
	}
	throw error;
}
