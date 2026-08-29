<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { formatDate } from '$lib/format';
	import { isAnswered } from '$lib/registrant';
	import type { AnswerValue, QuestionType } from '@awsug/shared';

	interface Props {
		/**
		 * What the question asks for *now*. A hint, not a guarantee: answers are
		 * stored as they were given, and a question can be retyped afterwards —
		 * so the branches below check the value they actually got first.
		 */
		type: QuestionType;
		value: AnswerValue | undefined;
	}

	let { type, value }: Props = $props();

	let text = $derived(typeof value === 'string' ? value : String(value ?? ''));

	// Only http(s) becomes a link. `z.url()` accepts any scheme that parses, and
	// `javascript:` parses — an organiser opening somebody's answer must not be
	// running it.
	let linkable = $derived(/^https?:\/\//i.test(text));
</script>

{#if !isAnswered(value)}
	<span class="text-muted-foreground italic">Not answered</span>
{:else if Array.isArray(value)}
	<!--
		Badges rather than "a; b; c": a multi-select is a set of separate things,
		and joining them into one string makes the eye parse it back apart.
	-->
	<div class="flex flex-wrap gap-1.5">
		{#each value as choice (choice)}
			<Badge variant="secondary">{choice}</Badge>
		{/each}
	</div>
{:else if type === 'yesNo' || type === 'consent' || typeof value === 'boolean'}
	{@const yes = value === true || value === 'yes' || value === 'true'}
	<!--
		"Accepted / Declined" against a sentence like "I accept the terms", "Yes /
		No" against a question. The same boolean, but a different reading — which
		is the distinction the insights page draws too.
	-->
	<Badge variant={yes ? 'secondary' : 'outline'}>
		{type === 'consent' ? (yes ? 'Accepted' : 'Declined') : yes ? 'Yes' : 'No'}
	</Badge>
{:else if type === 'rating'}
	<span class="tabular-nums">{text}<span class="text-muted-foreground"> / 5</span></span>
{:else if type === 'email'}
	<a class="hover:underline" href="mailto:{text}">{text}</a>
{:else if type === 'phone'}
	<a class="hover:underline" href="tel:{text.replace(/[^+\d]/g, '')}">{text}</a>
{:else if type === 'url'}
	{#if linkable}
		<a class="break-all hover:underline" href={text} target="_blank" rel="noreferrer">{text}</a>
	{:else}
		<span class="break-all">{text}</span>
	{/if}
{:else if type === 'date'}
	<!--
		Pinned to +07:00 rather than parsed as local time. `new Date('2026-03-01')`
		is UTC midnight and `…T00:00:00` is midnight wherever the code happens to
		run, and either can land on the day before once formatted in Vientiane.
	-->
	{@const day = new Date(`${text}T00:00:00+07:00`)}
	{Number.isNaN(day.getTime()) ? text : formatDate(day)}
{:else if type === 'paragraph'}
	<!-- The line breaks somebody typed are part of what they wrote. -->
	<p class="whitespace-pre-wrap">{text}</p>
{:else}
	{text}
{/if}
