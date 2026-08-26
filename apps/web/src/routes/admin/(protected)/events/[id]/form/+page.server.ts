import { adminApi } from '$lib/server/admin';
import { formValues, toAdminFailure, zodFail } from '$lib/server/form';
import {
	formDefinitionSchema,
	isDomainError,
	isQuestion,
	type Answers,
	type FormDefinition
} from '@awsug/shared';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { AdminEventDetail } from '../+page.server';

interface Registrant {
	answers: Answers;
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const client = adminApi(cookies, fetch);

	try {
		const [event, blocks, registrations] = await Promise.all([
			client.get<AdminEventDetail>(`/admin/events/${params.id}`),
			client.get<FormDefinition>(`/admin/events/${params.id}/form`),
			client.get<Registrant[]>(`/admin/events/${params.id}/registrations`)
		]);

		/*
		 * How many people answered each question. Shown beside the delete button
		 * so removing a question is a decision made with the number in view
		 * rather than one discovered afterwards.
		 */
		const answerCounts: Record<string, number> = {};
		for (const registration of registrations) {
			for (const [id, value] of Object.entries(registration.answers ?? {})) {
				const answered =
					value !== null &&
					value !== undefined &&
					!(Array.isArray(value) && value.length === 0) &&
					!(typeof value === 'string' && value.trim() === '');
				if (answered) answerCounts[id] = (answerCounts[id] ?? 0) + 1;
			}
		}

		return { event, blocks, answerCounts };
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};

export const actions: Actions = {
	default: async ({ request, params, cookies, fetch }) => {
		const data = await request.formData();
		const values = formValues(data);

		/*
		 * The builder posts the whole definition as one JSON string, exactly as
		 * the rich text editor posts its document. Malformed JSON becomes an empty
		 * form so Zod produces a readable message instead of a parse error —
		 * the same trade parseEventForm already makes.
		 */
		const parsedJson = parseBlocksJson(data.get('blocks'));

		const parsed = formDefinitionSchema.safeParse(parsedJson);
		if (!parsed.success) {
			return zodFail(parsed.error, values, { mapPath: blockPathMapper(parsedJson) });
		}

		try {
			await adminApi(cookies, fetch).put(`/admin/events/${params.id}/form`, {
				blocks: parsed.data
			});
		} catch (err) {
			return toAdminFailure(err, values);
		}

		return { message: 'Saved.' };
	}
};

/** Malformed JSON becomes an empty form, so Zod reports it rather than throwing. */
function parseBlocksJson(raw: FormDataEntryValue | null): unknown {
	try {
		return JSON.parse(String(raw ?? '[]'));
	} catch {
		return [];
	}
}

/**
 * Zod reports `3.options`, but nothing on this page is named that — the blocks
 * are one JSON field. Naming the offending question in the message is the only
 * way to point at it, so the index becomes the question's own label.
 */
function blockPathMapper(raw: unknown) {
	const blocks = Array.isArray(raw) ? (raw as FormDefinition) : [];

	return (path: readonly PropertyKey[]): string => {
		if (typeof path[0] !== 'number') return path.map(String).join('.');

		const block = blocks[path[0]];
		const name = block && isQuestion(block) && block.label ? block.label : `Block ${path[0] + 1}`;
		return `${name} (${path.slice(1).map(String).join('.') || 'block'})`;
	};
}
