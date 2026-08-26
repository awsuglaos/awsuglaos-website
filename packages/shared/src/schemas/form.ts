import { z } from 'zod';
import { emailSchema, imageUrlSchema, phoneSchema, text } from '../primitives.js';
import { isRichTextEmpty, richTextDocSchema } from '../rich-text.js';

/**
 * The registration form builder.
 *
 * A form is an ordered list of blocks: questions, which collect an answer, and
 * content, which does not. The definition is stored as JSON on the event rather
 * than as rows, because it is edited and saved as a single document — and
 * because a normalised table would need a migration every time someone wanted a
 * new kind of question.
 *
 * Answers are keyed by block **id**, never by label or position. An id is
 * generated once when the question is created and never reused, so renaming
 * "Experience" to "How much AWS have you used?" or dragging it up the form
 * leaves every answer already collected still attached to it.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export const QUESTION_TYPES = [
	'shortText',
	'paragraph',
	'radio',
	'checkboxes',
	'dropdown',
	'rating',
	'number',
	'date',
	'yesNo',
	'email',
	'phone',
	'url'
] as const;

export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const CONTENT_TYPES = ['heading', 'richText', 'image', 'divider'] as const;
export const contentTypeSchema = z.enum(CONTENT_TYPES);
export type ContentType = z.infer<typeof contentTypeSchema>;

/** The types that draw their answer from a fixed list. */
export const CHOICE_TYPES = ['radio', 'checkboxes', 'dropdown'] as const;
export const isChoiceType = (type: QuestionType): boolean =>
	(CHOICE_TYPES as readonly string[]).includes(type);

/**
 * What a question *means* to the rest of the system.
 *
 * The builder is free-form: name and email are ordinary questions that can be
 * renamed, reordered or deleted. But tickets, the confirmation email, the
 * one-registration-per-person rule and the check-in list all need to know which
 * answer is a person's name and which is their address. A role says so, and the
 * submitted value is mirrored into the matching `registrations` column.
 *
 * No role is mandatory. An event with no email question simply issues tickets
 * that cannot be emailed and stops de-duplicating — the builder warns, and
 * nothing breaks.
 */
export const FIELD_ROLES = ['name', 'email', 'phone', 'organisation'] as const;
export const fieldRoleSchema = z.enum(FIELD_ROLES);
export type FieldRole = z.infer<typeof fieldRoleSchema>;

/** Which question types make sense for a given role. */
export const ROLE_TYPES: Record<FieldRole, readonly QuestionType[]> = {
	name: ['shortText'],
	email: ['email'],
	phone: ['phone'],
	organisation: ['shortText']
};

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Opaque and URL-safe. It becomes a JSON object key, an input name and a CSV
 * column header, so it stays to characters that are unambiguous in all three.
 */
export const blockIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(40)
	.regex(/^[A-Za-z0-9_-]+$/, 'Invalid field id');

const optionSchema = text(1, 200, 'Option');

export const questionBlockSchema = z
	.object({
		kind: z.literal('question'),
		id: blockIdSchema,
		type: questionTypeSchema,
		label: text(1, 200, 'Question'),
		help: z.string().trim().max(500).nullable().default(null),
		placeholder: z.string().trim().max(120).nullable().default(null),
		required: z.boolean().default(false),
		role: fieldRoleSchema.nullable().default(null),
		/**
		 * Choice types only. Plain labels rather than ids with labels: the answer
		 * stored *is* the label, which keeps the CSV readable and the tally
		 * obvious. The cost is that renaming an option does not rewrite answers
		 * already given — the builder says so where it is edited.
		 */
		options: z.array(optionSchema).max(50).default([]),
		/** `number` only. Null means unbounded. */
		min: z.number().int().min(-1_000_000).max(1_000_000).nullable().default(null),
		max: z.number().int().min(-1_000_000).max(1_000_000).nullable().default(null)
	})
	.superRefine((block, ctx) => {
		if (isChoiceType(block.type)) {
			if (block.options.length < 2) {
				ctx.addIssue({
					code: 'custom',
					path: ['options'],
					message: 'Give this question at least two options'
				});
			}
			if (new Set(block.options).size !== block.options.length) {
				ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different' });
			}
		}

		if (
			block.type === 'number' &&
			block.min !== null &&
			block.max !== null &&
			block.min > block.max
		) {
			ctx.addIssue({ code: 'custom', path: ['max'], message: 'Maximum must be above the minimum' });
		}

		if (block.role && !ROLE_TYPES[block.role].includes(block.type)) {
			ctx.addIssue({
				code: 'custom',
				path: ['role'],
				message: `A "${block.role}" field must be a ${ROLE_TYPES[block.role].join(' or ')} question`
			});
		}
	});

export type QuestionBlock = z.infer<typeof questionBlockSchema>;

export const contentBlockSchema = z
	.object({
		kind: z.literal('content'),
		id: blockIdSchema,
		type: contentTypeSchema,
		/** `heading` only. */
		text: z.string().trim().max(200).nullable().default(null),
		/** `richText` only — the same TipTap document every editor here produces. */
		doc: richTextDocSchema.nullable().default(null),
		/** `image` only. */
		url: imageUrlSchema.nullable().default(null),
		alt: z.string().trim().max(200).nullable().default(null),
		caption: z.string().trim().max(200).nullable().default(null)
	})
	.superRefine((block, ctx) => {
		if (block.type === 'heading' && !block.text) {
			ctx.addIssue({ code: 'custom', path: ['text'], message: 'Write the heading' });
		}
		if (block.type === 'richText' && (!block.doc || isRichTextEmpty(block.doc))) {
			ctx.addIssue({
				code: 'custom',
				path: ['doc'],
				message: 'Write something, or remove the block'
			});
		}
		if (block.type === 'image' && !block.url) {
			ctx.addIssue({ code: 'custom', path: ['url'], message: 'Upload an image, or paste a URL' });
		}
	});

export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const formBlockSchema = z.union([questionBlockSchema, contentBlockSchema]);
export type FormBlock = z.infer<typeof formBlockSchema>;

export const isQuestion = (block: FormBlock): block is QuestionBlock => block.kind === 'question';
export const isContent = (block: FormBlock): block is ContentBlock => block.kind === 'content';

/**
 * A whole form.
 *
 * The ceiling is generous but present: this is written to one JSONB column and
 * rendered into one page, and a form with 200 questions is a mistake rather
 * than a requirement.
 */
export const formDefinitionSchema = z
	.array(formBlockSchema)
	.max(80, 'That is too many blocks for one form')
	.superRefine((blocks, ctx) => {
		const ids = new Set<string>();
		for (const block of blocks) {
			if (ids.has(block.id)) {
				ctx.addIssue({ code: 'custom', message: 'Two blocks share an id' });
				break;
			}
			ids.add(block.id);
		}

		// One question per role, or mirroring into `registrations` would have to
		// pick a winner — and whichever it picked would be wrong half the time.
		const seen = new Set<FieldRole>();
		for (const block of blocks) {
			if (!isQuestion(block) || !block.role) continue;
			if (seen.has(block.role)) {
				ctx.addIssue({
					code: 'custom',
					message: `Only one question can be the "${block.role}" field`
				});
				break;
			}
			seen.add(block.role);
		}
	});

export type FormDefinition = z.infer<typeof formDefinitionSchema>;

export const setEventFormInputSchema = z.object({ blocks: formDefinitionSchema });
export type SetEventFormInput = z.infer<typeof setEventFormInputSchema>;

/* -------------------------------------------------------------------------- */
/* Answers                                                                    */
/* -------------------------------------------------------------------------- */

export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;

const isBlank = (value: unknown): boolean =>
	value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/** Validates a value that is actually present. Blanks never reach these. */
function presentValueSchema(question: QuestionBlock): z.ZodType<Exclude<AnswerValue, null>> {
	const label = question.label;

	switch (question.type) {
		case 'email':
			return emailSchema;
		case 'phone':
			return phoneSchema;
		case 'url':
			return z
				.string()
				.trim()
				.pipe(z.url('Enter a full URL starting with https://'))
				.pipe(z.string().max(2048));
		case 'paragraph':
			return text(1, 4000, label);
		case 'date':
			return z
				.string()
				.trim()
				.regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');
		case 'yesNo':
			return z
				.union([z.boolean(), z.enum(['yes', 'no', 'true', 'false', 'on'])])
				.transform(
					(value) => value === true || value === 'yes' || value === 'true' || value === 'on'
				);
		case 'rating':
			return z.coerce
				.number()
				.int('Choose a rating')
				.min(1, 'Choose a rating')
				.max(5, 'Choose a rating');
		case 'number': {
			let schema = z.coerce.number().int(`${label} must be a whole number`);
			if (question.min !== null)
				schema = schema.min(question.min, `${label} must be at least ${question.min}`);
			if (question.max !== null)
				schema = schema.max(question.max, `${label} must be at most ${question.max}`);
			return schema;
		}
		case 'radio':
		case 'dropdown':
			return z
				.string()
				.trim()
				.refine((value) => question.options.includes(value), 'Choose one of the listed options');
		case 'checkboxes':
			return z
				.array(z.string().trim())
				.refine(
					(values) => values.every((v) => question.options.includes(v)),
					'Choose from the listed options'
				);
		case 'shortText':
		default:
			return text(1, 500, label);
	}
}

/** One answer: blank becomes null, anything else is validated for its type. */
function answerFieldSchema(question: QuestionBlock): z.ZodType<AnswerValue> {
	if (question.type === 'checkboxes') {
		return z.preprocess(
			(value) => (value === undefined || value === null ? [] : value),
			presentValueSchema(question)
		) as z.ZodType<AnswerValue>;
	}

	return z.preprocess(
		(value) => (isBlank(value) ? null : value),
		z.union([z.null(), presentValueSchema(question)])
	) as z.ZodType<AnswerValue>;
}

/**
 * Builds the schema for one form's submissions.
 *
 * Required-ness is checked once, at the end, rather than baked into each field:
 * a missing answer then reads "Dietary needs is required" instead of a type
 * error about `undefined`, and every field schema stays free to say only what
 * a *present* value must look like.
 *
 * The same function runs in the browser and on the server. The browser copy is
 * a courtesy; the server one is the check that counts.
 */
export function buildAnswersSchema(blocks: FormDefinition) {
	const questions = blocks.filter(isQuestion);

	const shape: Record<string, z.ZodType<AnswerValue>> = {};
	for (const question of questions) shape[question.id] = answerFieldSchema(question);

	return z.object(shape).superRefine((answers: Answers, ctx: z.RefinementCtx) => {
		for (const question of questions) {
			if (!question.required) continue;

			const value = answers[question.id];
			const empty =
				value === null || value === undefined || (Array.isArray(value) && value.length === 0);
			if (empty) {
				ctx.addIssue({
					code: 'custom',
					path: [question.id],
					message: `${question.label} is required`
				});
			}
		}
	}) as unknown as z.ZodType<Answers>;
}

/** The answer a role-tagged question collected, as a string, or null. */
export function answerForRole(
	blocks: FormDefinition,
	answers: Answers,
	role: FieldRole
): string | null {
	const question = blocks.find((block) => isQuestion(block) && block.role === role);
	if (!question) return null;

	const value = answers[question.id];
	if (value === null || value === undefined || Array.isArray(value)) return null;
	const asString = String(value).trim();
	return asString === '' ? null : asString;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The form every event started with, and the one a new event is seeded with.
 *
 * Keeping it as data rather than as hard-coded markup is what made the builder
 * possible without a flag day: existing events are backfilled with exactly
 * this, so nothing an attendee sees changes until an organiser chooses to
 * change it.
 */
export const DEFAULT_FORM_BLOCKS: FormDefinition = [
	{
		kind: 'question',
		id: 'fullName',
		type: 'shortText',
		label: 'Full name',
		help: null,
		placeholder: null,
		required: true,
		role: 'name',
		options: [],
		min: null,
		max: null
	},
	{
		kind: 'question',
		id: 'email',
		type: 'email',
		label: 'Email address',
		help: null,
		placeholder: null,
		required: true,
		role: 'email',
		options: [],
		min: null,
		max: null
	},
	{
		kind: 'question',
		id: 'phone',
		type: 'phone',
		label: 'Phone',
		help: null,
		placeholder: '020 XXXXXXXX',
		required: false,
		role: 'phone',
		options: [],
		min: null,
		max: null
	},
	{
		kind: 'question',
		id: 'organisation',
		type: 'shortText',
		label: 'Organisation',
		help: null,
		placeholder: null,
		required: false,
		role: 'organisation',
		options: [],
		min: null,
		max: null
	}
];

/** A fresh block id. Short, opaque, and safe as an object key and input name. */
export function createBlockId(): string {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
