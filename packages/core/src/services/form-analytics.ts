import type { RegistrationRow } from '@awsug/db';
import {
	isChoiceType,
	isQuestion,
	type Answers,
	type FormDefinition,
	type QuestionBlock,
	type QuestionType
} from '@awsug/shared';
import { answerToText } from './registrations.js';

/**
 * Turns a pile of registrations into something an organiser can read.
 *
 * Everything here happens in memory rather than in SQL. A meetup's
 * registrations are counted in the hundreds, the answers live in one JSONB
 * column, and a query per question would mean N round trips to produce one
 * page — while the equivalent jsonb aggregation would be far harder to read
 * than the loops below and no faster at this size.
 */

export interface ChoiceTally {
	label: string;
	count: number;
	/** Of those who answered, not of everyone who registered. */
	percent: number;
}

export interface NumberPoint {
	value: number;
	count: number;
}

export interface QuestionSummary {
	id: string;
	label: string;
	type: QuestionType;
	required: boolean;
	/** How many registrations gave this question an answer. */
	answered: number;
	/** Answered as a percentage of all registrations. */
	responseRate: number;

	/** Choice questions: one row per offered option, in the order defined. */
	tallies: ChoiceTally[];
	/** Rating and number questions. */
	average: number | null;
	median: number | null;
	distribution: NumberPoint[];
	/** Yes/no questions. */
	yes: number;
	no: number;
	/** Text questions: every answer, newest registration first. */
	responses: string[];
}

/** Answers to a question that has since been deleted from the form. */
export interface OrphanAnswers {
	id: string;
	count: number;
	samples: string[];
}

export interface TrendPoint {
	/** `YYYY-MM-DD` in Vientiane time. */
	date: string;
	count: number;
	cumulative: number;
}

export interface FormAnalytics {
	total: number;
	questions: QuestionSummary[];
	orphans: OrphanAnswers[];
	trend: TrendPoint[];
}

/*
 * Grouped by the Vientiane day, not the UTC one. An 09:00 sign-up in Vientiane
 * is 02:00 UTC the same day, but a 23:30 one is 16:30 UTC — and grouping by UTC
 * would scatter a single evening's registrations across two bars on the chart
 * an organiser is reading to decide when to post the next reminder.
 */
const VIENTIANE_DAY = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Vientiane',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

export const vientianeDay = (date: Date): string => VIENTIANE_DAY.format(date);

const round1 = (value: number): number => Math.round(value * 10) / 10;

function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;

	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0
		? round1((sorted[middle - 1]! + sorted[middle]!) / 2)
		: sorted[middle]!;
}

const isAnswered = (value: unknown): boolean =>
	value !== null &&
	value !== undefined &&
	!(Array.isArray(value) && value.length === 0) &&
	!(typeof value === 'string' && value.trim() === '');

function summariseQuestion(
	question: QuestionBlock,
	rows: readonly RegistrationRow[]
): QuestionSummary {
	const values = rows.map((row) => (row.answers as Answers)?.[question.id]);
	const answered = values.filter(isAnswered);

	const summary: QuestionSummary = {
		id: question.id,
		label: question.label,
		type: question.type,
		required: question.required,
		answered: answered.length,
		responseRate: rows.length === 0 ? 0 : Math.round((answered.length / rows.length) * 100),
		tallies: [],
		average: null,
		median: null,
		distribution: [],
		yes: 0,
		no: 0,
		responses: []
	};

	if (isChoiceType(question.type)) {
		// Seeded from the question's own options so an option nobody picked still
		// appears, at zero — which is itself the answer to "did anyone want this?".
		const counts = new Map<string, number>(question.options.map((option) => [option, 0]));

		for (const value of answered) {
			const picked = Array.isArray(value) ? value : [String(value)];
			for (const one of picked) counts.set(one, (counts.get(one) ?? 0) + 1);
		}

		// A multi-select is counted per respondent, so its percentages are "of the
		// people who answered", and may total more than 100.
		const base = answered.length || 1;
		summary.tallies = [...counts].map(([label, count]) => ({
			label,
			count,
			percent: Math.round((count / base) * 100)
		}));

		return summary;
	}

	if (question.type === 'rating' || question.type === 'number') {
		const numbers = answered.map(Number).filter((n) => Number.isFinite(n));

		if (numbers.length > 0) {
			summary.average = round1(numbers.reduce((sum, n) => sum + n, 0) / numbers.length);
			summary.median = median(numbers);

			const counts = new Map<number, number>();
			// A rating always shows all five points, so an empty column reads as
			// "nobody said this" rather than vanishing from the axis.
			if (question.type === 'rating') for (const n of [1, 2, 3, 4, 5]) counts.set(n, 0);
			for (const n of numbers) counts.set(n, (counts.get(n) ?? 0) + 1);

			summary.distribution = [...counts]
				.map(([value, count]) => ({ value, count }))
				.sort((a, b) => a.value - b.value);
		}

		return summary;
	}

	if (question.type === 'yesNo') {
		for (const value of answered) {
			if (value === true || value === 'yes' || value === 'true') summary.yes += 1;
			else summary.no += 1;
		}
		return summary;
	}

	summary.responses = answered.map(answerToText);
	return summary;
}

/**
 * Answers whose question is no longer on the form.
 *
 * Deleting a question does not delete what people already told you, and the
 * page says so rather than quietly dropping it. Samples are capped: this is a
 * signal that something is there, not a second transcript.
 */
function findOrphans(form: FormDefinition, rows: readonly RegistrationRow[]): OrphanAnswers[] {
	const known = new Set(form.filter(isQuestion).map((question) => question.id));
	const found = new Map<string, { count: number; samples: string[] }>();

	for (const row of rows) {
		for (const [id, value] of Object.entries((row.answers ?? {}) as Answers)) {
			if (known.has(id) || !isAnswered(value)) continue;

			const entry = found.get(id) ?? { count: 0, samples: [] };
			entry.count += 1;
			if (entry.samples.length < 5) entry.samples.push(answerToText(value));
			found.set(id, entry);
		}
	}

	return [...found].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => b.count - a.count);
}

/**
 * Registrations per day, with the quiet days included.
 *
 * The gaps matter: a chart drawn only from days that had a sign-up turns a
 * fortnight of silence into a single flat step and hides exactly the thing an
 * organiser is looking for.
 */
function buildTrend(rows: readonly RegistrationRow[]): TrendPoint[] {
	if (rows.length === 0) return [];

	const perDay = new Map<string, number>();
	for (const row of rows) {
		const day = vientianeDay(row.createdAt);
		perDay.set(day, (perDay.get(day) ?? 0) + 1);
	}

	const days = [...perDay.keys()].sort();
	const first = new Date(`${days[0]}T00:00:00Z`);
	const last = new Date(`${days[days.length - 1]}T00:00:00Z`);

	const points: TrendPoint[] = [];
	let cumulative = 0;

	for (
		let cursor = new Date(first);
		cursor <= last && points.length < 400;
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	) {
		const date = cursor.toISOString().slice(0, 10);
		const count = perDay.get(date) ?? 0;
		cumulative += count;
		points.push({ date, count, cumulative });
	}

	return points;
}

export function summariseRegistrations(
	form: FormDefinition,
	rows: readonly RegistrationRow[]
): FormAnalytics {
	return {
		total: rows.length,
		questions: form.filter(isQuestion).map((question) => summariseQuestion(question, rows)),
		orphans: findOrphans(form, rows),
		trend: buildTrend(rows)
	};
}
