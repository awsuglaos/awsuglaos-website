import { describe, expect, it } from 'vitest';
import {
	answerForRole,
	buildAnswersSchema,
	DEFAULT_FORM_BLOCKS,
	formDefinitionSchema,
	type FormDefinition,
	type QuestionBlock
} from './form.js';

/** A question with every optional field at its default, so tests stay short. */
function question(partial: Partial<QuestionBlock> & { id: string }): QuestionBlock {
	return {
		kind: 'question',
		type: 'shortText',
		label: partial.label ?? 'Question',
		help: null,
		placeholder: null,
		required: false,
		role: null,
		options: [],
		min: null,
		max: null,
		...partial
	} as QuestionBlock;
}

describe('formDefinitionSchema', () => {
	it('accepts the default form', () => {
		expect(formDefinitionSchema.safeParse(DEFAULT_FORM_BLOCKS).success).toBe(true);
	});

	it('refuses a choice question with fewer than two options', () => {
		const result = formDefinitionSchema.safeParse([
			question({ id: 'a', type: 'radio', options: ['Only one'] })
		]);

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toMatch(/at least two options/);
	});

	it('refuses duplicate options', () => {
		const result = formDefinitionSchema.safeParse([
			question({ id: 'a', type: 'dropdown', options: ['Yes', 'Yes'] })
		]);

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toMatch(/must be different/);
	});

	it('allows only one question per role', () => {
		const result = formDefinitionSchema.safeParse([
			question({ id: 'a', type: 'email', role: 'email', label: 'Email' }),
			question({ id: 'b', type: 'email', role: 'email', label: 'Work email' })
		]);

		expect(result.success).toBe(false);
		expect(result.error?.issues.some((i) => /only one question/i.test(i.message))).toBe(true);
	});

	it('refuses a role on a question type that cannot carry it', () => {
		const result = formDefinitionSchema.safeParse([
			question({ id: 'a', type: 'paragraph', role: 'email' })
		]);

		expect(result.success).toBe(false);
	});

	it('refuses two blocks sharing an id', () => {
		const result = formDefinitionSchema.safeParse([question({ id: 'a' }), question({ id: 'a' })]);

		expect(result.success).toBe(false);
		expect(result.error?.issues.some((i) => /share an id/.test(i.message))).toBe(true);
	});

	it('keeps content blocks that carry their content', () => {
		const result = formDefinitionSchema.safeParse([
			{ kind: 'content', id: 'h1', type: 'heading', text: 'About you' },
			{ kind: 'content', id: 'd1', type: 'divider' }
		]);

		expect(result.success).toBe(true);
	});

	it('refuses a heading with no text', () => {
		const result = formDefinitionSchema.safeParse([
			{ kind: 'content', id: 'h1', type: 'heading', text: '' }
		]);

		expect(result.success).toBe(false);
	});
});

describe('buildAnswersSchema', () => {
	const blocks = formDefinitionSchema.parse([
		question({ id: 'name', label: 'Full name', required: true, role: 'name' }),
		question({ id: 'mail', type: 'email', label: 'Email', required: true, role: 'email' }),
		question({
			id: 'level',
			type: 'radio',
			label: 'Experience',
			required: true,
			options: ['New', 'Some', 'Lots']
		}),
		question({
			id: 'tracks',
			type: 'checkboxes',
			label: 'Tracks',
			options: ['Serverless', 'Data']
		}),
		question({ id: 'stars', type: 'rating', label: 'Excitement' }),
		question({ id: 'size', type: 'number', label: 'Team size', min: 1, max: 500 }),
		question({ id: 'diet', type: 'paragraph', label: 'Dietary needs' }),
		question({ id: 'first', type: 'yesNo', label: 'First meetup?' }),
		{ kind: 'content', id: 'note', type: 'heading', text: 'About you' }
	] as FormDefinition);

	const schema = buildAnswersSchema(blocks);

	const valid = {
		name: 'Somchai',
		mail: 'Somchai@Example.LA',
		level: 'Some',
		tracks: ['Data'],
		stars: '4',
		size: '12',
		diet: '',
		first: 'yes'
	};

	it('accepts a filled form and normalises as it goes', () => {
		const result = schema.safeParse(valid);

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			mail: 'somchai@example.la', // lower-cased by emailSchema
			stars: 4, // coerced to a number
			size: 12,
			first: true, // "yes" becomes a boolean
			diet: null // blank optional becomes null, not ""
		});
	});

	it('ignores content blocks entirely', () => {
		const result = schema.safeParse(valid);
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty('note');
	});

	it('names the question when a required answer is missing', () => {
		const result = schema.safeParse({ ...valid, level: '' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('Experience is required');
		expect(result.error?.issues[0]?.path).toEqual(['level']);
	});

	it('treats an empty multi-select as unanswered when it is required', () => {
		const withRequired = buildAnswersSchema(
			formDefinitionSchema.parse([
				question({
					id: 'tracks',
					type: 'checkboxes',
					label: 'Tracks',
					required: true,
					options: ['A', 'B']
				})
			] as FormDefinition)
		);

		expect(withRequired.safeParse({ tracks: [] }).success).toBe(false);
		expect(withRequired.safeParse({ tracks: ['A'] }).success).toBe(true);
	});

	describe('consent', () => {
		const consentForm = (required: boolean) =>
			buildAnswersSchema(
				formDefinitionSchema.parse([
					question({
						id: 'terms',
						type: 'consent',
						label: 'I accept the terms and conditions',
						required
					})
				] as FormDefinition)
			);

		it('refuses a required consent that was left unticked', () => {
			// An unticked checkbox submits nothing at all, so this is the shape the
			// server actually receives — not an explicit false.
			const result = consentForm(true).safeParse({});

			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path).toEqual(['terms']);
		});

		it('refuses a required consent that was explicitly declined', () => {
			// The rule that separates consent from every other type: `false` is a
			// present, non-empty value, so a generic required check would pass it.
			expect(consentForm(true).safeParse({ terms: false }).success).toBe(false);
		});

		it('accepts a required consent that was ticked', () => {
			// "on" is what a browser posts for a ticked box.
			expect(consentForm(true).safeParse({ terms: 'on' }).data).toEqual({ terms: true });
			expect(consentForm(true).safeParse({ terms: true }).data).toEqual({ terms: true });
		});

		it('stores an unticked optional consent as false rather than null', () => {
			// A declined consent is an answer worth counting, not a gap.
			expect(consentForm(false).safeParse({}).data).toEqual({ terms: false });
		});

		it('does not prefix the message with the label', () => {
			// The label is the sentence being agreed to. "I accept the terms and
			// conditions is required" is not a sentence anyone wants to read.
			const message = consentForm(true).safeParse({}).error?.issues[0]?.message ?? '';
			expect(message).not.toContain('I accept');
			expect(message.length).toBeGreaterThan(0);
		});

		it('cannot be given a field role', () => {
			const result = formDefinitionSchema.safeParse([
				question({ id: 'terms', type: 'consent', label: 'I accept', role: 'name' })
			]);
			expect(result.success).toBe(false);
		});
	});

	it('refuses a choice that is not on the list', () => {
		const result = schema.safeParse({ ...valid, level: 'Expert' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(['level']);
	});

	it('refuses an out-of-range rating and an out-of-range number', () => {
		expect(schema.safeParse({ ...valid, stars: '9' }).success).toBe(false);
		expect(schema.safeParse({ ...valid, size: '900' }).success).toBe(false);
	});

	it('refuses a malformed email', () => {
		expect(schema.safeParse({ ...valid, mail: 'not-an-address' }).success).toBe(false);
	});

	/*
	 * An optional question used to be `z.union([z.null(), rule])`, which reports
	 * `invalid_union` and a generic "Invalid input", burying the rule's own
	 * message a level down. The visitor was told their answer was wrong but not
	 * why — on every optional field in the form.
	 */
	it('tells the visitor which rule an optional answer broke', () => {
		const withPhone = buildAnswersSchema(
			formDefinitionSchema.parse([
				question({ id: 'tel', type: 'phone', label: 'Phone' })
			] as FormDefinition)
		);

		const result = withPhone.safeParse({ tel: 'not-a-phone-number' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('Enter a valid phone number');
		expect(result.error?.issues[0]?.path).toEqual(['tel']);
	});

	it('still accepts a blank optional answer as null', () => {
		const withPhone = buildAnswersSchema(
			formDefinitionSchema.parse([
				question({ id: 'tel', type: 'phone', label: 'Phone' })
			] as FormDefinition)
		);

		expect(withPhone.parse({ tel: '' })).toEqual({ tel: null });
		expect(withPhone.parse({})).toEqual({ tel: null });
	});
});

describe('answerForRole', () => {
	const blocks = formDefinitionSchema.parse(DEFAULT_FORM_BLOCKS);

	it('finds the value behind a role', () => {
		const answers = {
			fullName: 'Somchai',
			email: 'somchai@example.la',
			phone: null,
			organisation: null
		};

		expect(answerForRole(blocks, answers, 'name')).toBe('Somchai');
		expect(answerForRole(blocks, answers, 'email')).toBe('somchai@example.la');
		expect(answerForRole(blocks, answers, 'phone')).toBeNull();
	});

	it('returns null when no question carries the role', () => {
		const noEmail = formDefinitionSchema.parse([
			question({ id: 'a', label: 'Name', role: 'name' })
		]);

		expect(answerForRole(noEmail, { a: 'Somchai' }, 'email')).toBeNull();
	});
});
