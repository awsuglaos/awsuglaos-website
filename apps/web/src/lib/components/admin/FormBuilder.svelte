<script lang="ts">
	import { enhance } from '$app/forms';
	import { AdminFormState, type AdminFormResult } from '$lib/admin-form.svelte';
	import FormBlockEditor from '$lib/components/admin/FormBlockEditor.svelte';
	import UnsavedGuard from '$lib/components/admin/unsaved-guard.svelte';
	import RegistrationForm from '$lib/components/RegistrationForm.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		createBlockId,
		EMPTY_DOC,
		isQuestion,
		type ContentType,
		type FieldRole,
		type FormBlock,
		type FormDefinition,
		type QuestionType
	} from '@awsug/shared';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import Eye from '@lucide/svelte/icons/eye';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';

	interface Props {
		blocks: FormDefinition;
		/** How many stored registrations answered each question, by block id. */
		answerCounts?: Record<string, number>;
		result?: AdminFormResult | null;
		action?: string;
	}

	let { blocks: initial, answerCounts = {}, result = null, action }: Props = $props();

	const formState = new AdminFormState();

	let blocks = $state<FormBlock[]>(structuredClone(initial) as FormBlock[]);
	let preview = $state(false);

	/*
	 * The whole definition posts as one JSON string in a hidden input, the same
	 * way the rich text editor posts its document. Nested options arrays do not
	 * survive the parallel-`getAll` pattern the materials page uses, and a form
	 * *builder* whose own form cannot express its data would be an odd thing.
	 */
	let serialized = $derived(JSON.stringify(blocks));

	const QUESTION_KINDS: { type: QuestionType; label: string }[] = [
		{ type: 'shortText', label: 'Short answer' },
		{ type: 'paragraph', label: 'Paragraph' },
		{ type: 'radio', label: 'Single choice' },
		{ type: 'checkboxes', label: 'Checkboxes' },
		{ type: 'dropdown', label: 'Dropdown' },
		{ type: 'rating', label: 'Rating (1–5)' },
		{ type: 'number', label: 'Number' },
		{ type: 'date', label: 'Date' },
		{ type: 'yesNo', label: 'Yes / no' },
		{ type: 'email', label: 'Email' },
		{ type: 'phone', label: 'Phone' },
		{ type: 'url', label: 'Link' }
	];

	const CONTENT_KINDS: { type: ContentType; label: string }[] = [
		{ type: 'heading', label: 'Section heading' },
		{ type: 'richText', label: 'Text block' },
		{ type: 'image', label: 'Image' },
		{ type: 'divider', label: 'Divider' }
	];

	const typeLabel = (block: FormBlock): string =>
		(isQuestion(block)
			? QUESTION_KINDS.find((k) => k.type === block.type)?.label
			: CONTENT_KINDS.find((k) => k.type === block.type)?.label) ?? block.type;

	function addQuestion(type: QuestionType) {
		blocks = [
			...blocks,
			{
				kind: 'question',
				id: createBlockId(),
				type,
				label: '',
				help: null,
				placeholder: null,
				required: false,
				role: null,
				// Choice types are unusable with no options, so they start with two
				// blanks rather than an empty list and a validation error.
				options: type === 'radio' || type === 'checkboxes' || type === 'dropdown' ? ['', ''] : [],
				min: null,
				max: null
			}
		];
		formState.dirty = true;
	}

	function addContent(type: ContentType) {
		blocks = [
			...blocks,
			{
				kind: 'content',
				id: createBlockId(),
				type,
				text: null,
				doc: type === 'richText' ? EMPTY_DOC : null,
				url: null,
				alt: null,
				caption: null
			}
		];
		formState.dirty = true;
	}

	function update(index: number, block: FormBlock) {
		blocks = blocks.map((existing, i) => (i === index ? block : existing));
		formState.dirty = true;
	}

	function move(index: number, by: number) {
		const to = index + by;
		if (to < 0 || to >= blocks.length) return;

		const next = [...blocks];
		const [moved] = next.splice(index, 1);
		next.splice(to, 0, moved!);
		blocks = next;
		formState.dirty = true;
	}

	function duplicate(index: number) {
		const source = blocks[index];
		if (!source) return;

		// A fresh id, always. Reusing it would make the copy share every answer the
		// original has ever collected.
		const copy = { ...structuredClone(source), id: createBlockId(), role: null } as FormBlock;
		blocks = [...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)];
		formState.dirty = true;
	}

	function remove(index: number) {
		blocks = blocks.filter((_, i) => i !== index);
		formState.dirty = true;
	}

	let takenRoles = $derived(
		new Set(
			blocks
				.filter(isQuestion)
				.map((block) => block.role)
				.filter((role): role is FieldRole => role !== null)
		)
	);

	let questionCount = $derived(blocks.filter(isQuestion).length);
</script>

<form
	method="POST"
	{action}
	bind:this={formState.form}
	use:enhance={formState.enhance}
	class="flex flex-col gap-6"
>
	<input type="hidden" name="blocks" value={serialized} />

	<!--
		The whole definition posts as one field, so a rejection cannot mark an
		input the way the other admin forms do. Listing the questions by name is
		what stands in for that.
	-->
	{#if result?.fieldErrors && Object.keys(result.fieldErrors).length > 0}
		<Alert variant="destructive">
			<AlertCircle class="size-4" />
			<AlertTitle>Nothing was saved</AlertTitle>
			<AlertDescription>
				<ul class="mt-1 flex list-disc flex-col gap-1 pl-4">
					{#each Object.entries(result.fieldErrors) as [where, message] (where)}
						<li><span class="font-medium">{where}</span> — {message}</li>
					{/each}
				</ul>
			</AlertDescription>
		</Alert>
	{/if}

	<!--
		The form is free-form: name and email are ordinary questions and can be
		deleted like any other. What that costs is worth saying plainly at the
		moment it is true, rather than refusing the edit.
	-->
	{#if !takenRoles.has('email')}
		<Alert variant="destructive">
			<AlertCircle class="size-4" />
			<AlertTitle>No email question</AlertTitle>
			<AlertDescription>
				Attendees will not receive a confirmation email or a ticket link, and the same person can
				register more than once. Add an email question and mark it as the attendee's email to
				restore both.
			</AlertDescription>
		</Alert>
	{/if}

	{#if !takenRoles.has('name')}
		<Alert>
			<AlertCircle class="size-4" />
			<AlertTitle>No name question</AlertTitle>
			<AlertDescription>
				The check-in screen and the registrant list will show ticket codes instead of names.
			</AlertDescription>
		</Alert>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<Button
			type="button"
			variant={preview ? 'outline' : 'secondary'}
			size="sm"
			onclick={() => (preview = false)}
		>
			<Pencil data-icon="inline-start" />
			Edit
		</Button>
		<Button
			type="button"
			variant={preview ? 'secondary' : 'outline'}
			size="sm"
			onclick={() => (preview = true)}
		>
			<Eye data-icon="inline-start" />
			Preview
		</Button>

		<span class="text-muted-foreground ml-auto text-xs">
			{questionCount}
			{questionCount === 1 ? 'question' : 'questions'}
		</span>
	</div>

	{#if preview}
		<Card.Root class="[--card-spacing:--spacing(6)]">
			<Card.Header>
				<Card.Title>What an attendee sees</Card.Title>
				<Card.Description>
					The real form, rendered from what is above. Nothing typed here is saved.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<!--
					Rich text blocks have no server-rendered `html` in the preview, so
					they show as the plain text they contain rather than as markup. The
					published page renders them properly; running a renderer in the
					browser purely to make a preview prettier is not worth the surface.
				-->
				<RegistrationForm blocks={blocks as FormDefinition} />
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="flex flex-col gap-3">
			{#each blocks as block, index (block.id)}
				<FormBlockEditor
					{block}
					{index}
					total={blocks.length}
					takenRoles={new Set(
						[...takenRoles].filter((role) => !(isQuestion(block) && block.role === role))
					)}
					answerCount={answerCounts[block.id] ?? 0}
					typeLabel={typeLabel(block)}
					onChange={(next) => update(index, next)}
					onMove={move}
					onDuplicate={duplicate}
					onDelete={remove}
				/>
			{/each}

			{#if blocks.length === 0}
				<div
					class="border-border text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm"
				>
					This form asks nothing. Add a question below — anyone who registers will simply get a
					ticket.
				</div>
			{/if}
		</div>

		<Card.Root class="[--card-spacing:--spacing(5)]">
			<Card.Header>
				<Card.Title class="text-base">Add a question</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="flex flex-wrap gap-2">
					{#each QUESTION_KINDS as kind (kind.type)}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={() => addQuestion(kind.type)}
						>
							<Plus data-icon="inline-start" />
							{kind.label}
						</Button>
					{/each}
				</div>

				<div>
					<p class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
						Content — shown, not asked
					</p>
					<div class="flex flex-wrap gap-2">
						{#each CONTENT_KINDS as kind (kind.type)}
							<Button type="button" variant="ghost" size="sm" onclick={() => addContent(kind.type)}>
								<Plus data-icon="inline-start" />
								{kind.label}
							</Button>
						{/each}
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<div
		class="bg-background/85 sticky bottom-0 -mx-4 flex items-center gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
	>
		<Button type="submit" disabled={formState.submitting}>
			{#if formState.submitting}<Spinner data-icon="inline-start" />{/if}
			{formState.submitting ? 'Saving…' : 'Save form'}
		</Button>

		{#if formState.dirty && !formState.submitting}
			<span class="text-muted-foreground ml-auto text-xs">Unsaved changes</span>
		{/if}
	</div>
</form>

<UnsavedGuard dirty={formState.dirty} />
