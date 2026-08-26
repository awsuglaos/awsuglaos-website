<script lang="ts">
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import RichTextEditor from '$lib/components/admin/RichTextEditor.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		FIELD_ROLES,
		isChoiceType,
		ROLE_TYPES,
		type FieldRole,
		type FormBlock,
		type QuestionBlock,
		type RichTextDoc
	} from '@awsug/shared';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Copy from '@lucide/svelte/icons/copy';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		block: FormBlock;
		index: number;
		total: number;
		/** Roles claimed by *other* blocks, so a role cannot be taken twice. */
		takenRoles: Set<FieldRole>;
		/** How many stored registrations answered this question. */
		answerCount: number;
		typeLabel: string;
		onChange: (block: FormBlock) => void;
		onMove: (index: number, by: number) => void;
		onDuplicate: (index: number) => void;
		onDelete: (index: number) => void;
	}

	let {
		block,
		index,
		total,
		takenRoles,
		answerCount,
		typeLabel,
		onChange,
		onMove,
		onDuplicate,
		onDelete
	}: Props = $props();

	/** Two-step delete, inline. See the note where it is rendered. */
	let confirming = $state(false);

	const patch = (changes: Partial<FormBlock>) => onChange({ ...block, ...changes } as FormBlock);

	let question = $derived(block.kind === 'question' ? (block as QuestionBlock) : null);

	/*
	 * Only the roles this question type can actually carry, minus the ones another
	 * question already holds. Offering "email" on a paragraph question would just
	 * be a validation error waiting to happen at save time.
	 */
	let availableRoles = $derived(
		question
			? FIELD_ROLES.filter(
					(role) =>
						ROLE_TYPES[role].includes(question.type) &&
						(!takenRoles.has(role) || question.role === role)
				)
			: []
	);

	function setOption(at: number, value: string) {
		if (!question) return;
		const options = [...question.options];
		options[at] = value;
		patch({ options });
	}

	function addOption() {
		if (!question) return;
		patch({ options: [...question.options, ''] });
	}

	function removeOption(at: number) {
		if (!question) return;
		patch({ options: question.options.filter((_, i) => i !== at) });
	}
</script>

<div class="border-border bg-card rounded-xl border p-4" data-block-id={block.id}>
	<div class="flex items-start gap-3">
		<GripVertical class="text-muted-foreground/50 mt-2 size-4 shrink-0" aria-hidden="true" />

		<div class="min-w-0 flex-1">
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<Badge variant="secondary" class="font-mono text-[0.6875rem]">{typeLabel}</Badge>

				{#if question?.role}
					<Badge variant="outline" class="text-[0.6875rem]">
						{question.role} field
					</Badge>
				{/if}

				{#if answerCount > 0}
					<span class="text-muted-foreground text-xs">
						{answerCount} answered
					</span>
				{/if}

				<div class="ml-auto flex items-center gap-0.5">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={index === 0}
						aria-label="Move up"
						onclick={() => onMove(index, -1)}
					>
						<ChevronUp />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={index === total - 1}
						aria-label="Move down"
						onclick={() => onMove(index, 1)}
					>
						<ChevronDown />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Duplicate"
						onclick={() => onDuplicate(index)}
					>
						<Copy />
					</Button>

					<!--
						Two-step delete rather than a dialog. The builder holds everything
						in memory until Save, so nothing is destroyed by this click — but a
						question that already has answers is worth a second look, and the
						count is the thing worth showing. A modal for an undoable local
						edit would be heavier than the action deserves.
					-->
					{#if confirming}
						<Button
							type="button"
							variant="destructive"
							size="sm"
							onclick={() => {
								confirming = false;
								onDelete(index);
							}}
						>
							{answerCount > 0 ? `Remove — keeps ${answerCount} answers` : 'Remove'}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Cancel"
							onclick={() => (confirming = false)}
						>
							<X />
						</Button>
					{:else}
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Remove block"
							onclick={() => (confirming = true)}
						>
							<Trash2 />
						</Button>
					{/if}
				</div>
			</div>

			{#if question}
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="sm:col-span-2">
						<Label for="label_{block.id}">Question</Label>
						<Input
							id="label_{block.id}"
							class="mt-1.5"
							value={question.label}
							placeholder="What do you want to ask?"
							oninput={(e) => patch({ label: e.currentTarget.value })}
						/>
					</div>

					<div class="sm:col-span-2">
						<Label for="help_{block.id}">Help text</Label>
						<Input
							id="help_{block.id}"
							class="mt-1.5"
							value={question.help ?? ''}
							placeholder="Shown under the field. Optional."
							oninput={(e) => patch({ help: e.currentTarget.value || null })}
						/>
					</div>

					{#if isChoiceType(question.type)}
						<fieldset class="sm:col-span-2">
							<legend class="text-sm font-medium">Options</legend>
							<p class="text-muted-foreground mt-0.5 text-xs">
								Renaming an option does not change answers already given — those keep the wording
								people actually chose.
							</p>

							<div class="mt-2 flex flex-col gap-2">
								{#each question.options as option, at (at)}
									<div class="flex items-center gap-2">
										<Input
											value={option}
											aria-label="Option {at + 1}"
											placeholder="Option {at + 1}"
											oninput={(e) => setOption(at, e.currentTarget.value)}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label="Remove option {at + 1}"
											onclick={() => removeOption(at)}
										>
											<X />
										</Button>
									</div>
								{/each}
							</div>

							<Button type="button" variant="outline" size="sm" class="mt-2" onclick={addOption}>
								<Plus data-icon="inline-start" />
								Add option
							</Button>
						</fieldset>
					{/if}

					{#if question.type === 'number'}
						<div>
							<Label for="min_{block.id}">Minimum</Label>
							<Input
								id="min_{block.id}"
								type="number"
								class="mt-1.5"
								value={question.min ?? ''}
								oninput={(e) =>
									patch({
										min: e.currentTarget.value === '' ? null : Number(e.currentTarget.value)
									})}
							/>
						</div>
						<div>
							<Label for="max_{block.id}">Maximum</Label>
							<Input
								id="max_{block.id}"
								type="number"
								class="mt-1.5"
								value={question.max ?? ''}
								oninput={(e) =>
									patch({
										max: e.currentTarget.value === '' ? null : Number(e.currentTarget.value)
									})}
							/>
						</div>
					{/if}

					<div class="flex items-center gap-2 sm:col-span-2">
						<input
							id="required_{block.id}"
							type="checkbox"
							class="accent-primary size-4"
							checked={question.required}
							onchange={(e) => patch({ required: e.currentTarget.checked })}
						/>
						<Label for="required_{block.id}" class="font-normal">Required</Label>

						{#if availableRoles.length > 0}
							<Label for="role_{block.id}" class="ml-auto font-normal">Use this answer as</Label>
							<select
								id="role_{block.id}"
								class="native-select w-auto"
								value={question.role ?? ''}
								onchange={(e) =>
									patch({ role: (e.currentTarget.value || null) as FieldRole | null })}
							>
								<option value="">Nothing special</option>
								{#each availableRoles as role (role)}
									<option value={role}>The attendee's {role}</option>
								{/each}
							</select>
						{/if}
					</div>
				</div>
			{:else if block.type === 'heading'}
				<Input
					value={block.text ?? ''}
					aria-label="Heading"
					placeholder="Section heading"
					oninput={(e) => patch({ text: e.currentTarget.value })}
				/>
			{:else if block.type === 'richText'}
				<RichTextEditor
					value={block.doc}
					label="Form content"
					onChange={(doc: RichTextDoc) => patch({ doc })}
				/>
			{:else if block.type === 'image'}
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="sm:col-span-2">
						<!--
							No `name`: the URL travels in the builder's single JSON payload
							rather than as a form field of its own, so it comes back through
							`onChange` instead of being posted.
						-->
						<ImageField
							name="image_{block.id}"
							label="Image"
							value={block.url ?? ''}
							help="Shown inside the form, at its own size."
							onChange={(url: string) => patch({ url: url || null })}
						/>
					</div>
					<div>
						<Label for="alt_{block.id}">Alt text</Label>
						<Input
							id="alt_{block.id}"
							class="mt-1.5"
							value={block.alt ?? ''}
							placeholder="Describes the image to a screen reader"
							oninput={(e) => patch({ alt: e.currentTarget.value || null })}
						/>
					</div>
					<div>
						<Label for="caption_{block.id}">Caption</Label>
						<Input
							id="caption_{block.id}"
							class="mt-1.5"
							value={block.caption ?? ''}
							oninput={(e) => patch({ caption: e.currentTarget.value || null })}
						/>
					</div>
				</div>
			{:else}
				<p class="text-muted-foreground text-sm">A horizontal rule between sections.</p>
			{/if}
		</div>
	</div>
</div>
