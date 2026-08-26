import type { RichTextDoc } from '@awsug/shared';
import type { SubmitFunction } from '@sveltejs/kit';
import { tick } from 'svelte';

/**
 * What an admin form action returns on failure. Produced by `zodFail` and
 * `toAdminFailure` in $lib/server/form.
 */
export interface AdminFormResult {
	message?: string;
	fieldErrors?: Record<string, string>;
	formErrors?: string[];
	values?: Record<string, string>;
}

/**
 * What the input should show: what the editor last typed, falling back to what
 * is stored.
 *
 * The order matters and is the whole point. Re-rendering the *saved* value
 * after a rejected save silently throws away the edit that was being made,
 * which is how a mistyped slug used to cost an afternoon's writing.
 */
export function fieldValue(
	result: AdminFormResult | null | undefined,
	name: string,
	fallback: string | number | null | undefined = ''
): string {
	const typed = result?.values?.[name];
	if (typed !== undefined) return typed;
	return fallback === null || fallback === undefined ? '' : String(fallback);
}

/** The message for one input, or undefined when it validated. */
export function fieldError(
	result: AdminFormResult | null | undefined,
	name: string
): string | undefined {
	return result?.fieldErrors?.[name];
}

/**
 * The same, for a rich text editor.
 *
 * The editor posts its document as a JSON string in a hidden input, so what
 * comes back in `values` is that string rather than a document. Malformed JSON
 * falls back to what was stored — an unparseable draft is not worth losing the
 * saved version over.
 */
export function richTextValue(
	result: AdminFormResult | null | undefined,
	name: string,
	fallback: RichTextDoc | null | undefined
): RichTextDoc | null {
	const typed = result?.values?.[name];
	if (typed === undefined) return fallback ?? null;

	try {
		return JSON.parse(typed) as RichTextDoc;
	} catch {
		return fallback ?? null;
	}
}

/** `true` when the field failed, in the shape `data-invalid`/`aria-invalid` want. */
export function invalid(
	result: AdminFormResult | null | undefined,
	name: string
): true | undefined {
	return result?.fieldErrors?.[name] ? true : undefined;
}

/**
 * Submission state for one admin form.
 *
 * These forms post normally and work with JavaScript switched off; `enhance`
 * only adds what cannot be expressed in HTML — a disabled button while the
 * request is in flight, and moving the caret to the first field that failed
 * instead of leaving the editor to hunt for it in a form several screens long.
 */
export class AdminFormState {
	submitting = $state(false);
	/** Set on first edit, cleared on a completed submit. Drives the exit guard. */
	dirty = $state(false);

	form = $state<HTMLFormElement | null>(null);

	readonly enhance: SubmitFunction = () => {
		this.submitting = true;

		/*
		 * Disarm the exit guard *now*, before the response, not after it.
		 *
		 * A successful create answers with a redirect, and `update()` puts that
		 * through `goto` — which is a client-side navigation, so `beforeNavigate`
		 * sees it. With the form still counted as dirty the guard cancelled it and
		 * asked whether to discard the work it had just saved, leaving the browser
		 * sitting on the create page. Every admin create flow broke this way.
		 */
		this.dirty = false;

		return async ({ update, result }) => {
			// `reset: false`: on an edit page the inputs already hold what was just
			// saved, and resetting would throw away client-side state the rich text
			// editor and the image fields keep outside the DOM.
			await update({ reset: false });

			this.submitting = false;

			// Nothing was saved, so the work on screen is still unsaved: re-arm the
			// guard rather than letting the next click walk away with it.
			if (result.type === 'failure' || result.type === 'error') this.dirty = true;

			await tick();
			this.focusFirstInvalid();
		};
	};

	/** Puts the caret on the first field the server rejected. */
	focusFirstInvalid(): void {
		const target = this.form?.querySelector<HTMLElement>('[aria-invalid="true"]');
		if (!target) return;

		target.scrollIntoView({ block: 'center', behavior: 'smooth' });
		target.focus({ preventScroll: true });
	}

	readonly markDirty = () => {
		this.dirty = true;
	};
}
