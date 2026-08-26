<script lang="ts">
	import StarRating from '$lib/components/StarRating.svelte';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as m from '$lib/paraglide/messages';
	import type { PublicFormBlock } from '@awsug/core';

	interface Props {
		blocks: PublicFormBlock[];
		/** Keyed by question id, from a rejected submission. */
		errors?: Record<string, string>;
		/** Keyed by question id, so a rejection does not empty the form. */
		values?: Record<string, string | string[]>;
	}

	let { blocks, errors = {}, values = {} }: Props = $props();

	/*
	 * Inputs are named `answer.<id>`, not `<id>`. The form is built by an
	 * organiser, so a question could otherwise be given an id that collides with
	 * the honeypot or with a future field of our own; the prefix keeps the
	 * builder's namespace and ours apart for good.
	 */
	const inputName = (id: string) => `answer.${id}`;

	const stringValue = (id: string): string => {
		const value = values[id];
		return typeof value === 'string' ? value : '';
	};

	const arrayValue = (id: string): string[] => {
		const value = values[id];
		if (Array.isArray(value)) return value;
		return typeof value === 'string' && value !== '' ? [value] : [];
	};

	const numberValue = (id: string): number | null => {
		const value = Number(stringValue(id));
		return Number.isFinite(value) && value > 0 ? value : null;
	};
</script>

<Field.FieldGroup>
	{#each blocks as block (block.id)}
		{#if block.kind === 'content'}
			{#if block.type === 'heading'}
				<h3 class="mt-2 text-lg font-semibold tracking-tight">{block.text}</h3>
			{:else if block.type === 'richText'}
				<!--
					Rendered and sanitised on the server by `toPublicForm`, exactly as the
					event description is. Never rendered from the raw document here: this
					JSON arrived over the network, and a renderer running in the browser
					would be trusting it.
				-->
				<div class="prose prose-neutral dark:prose-invert max-w-[68ch] text-sm">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised server-side, see above -->
					{@html block.html ?? ''}
				</div>
			{:else if block.type === 'image'}
				<figure class="m-0">
					<img
						src={block.url}
						alt={block.alt ?? ''}
						loading="lazy"
						class="border-border max-h-80 w-auto rounded-lg border object-contain"
					/>
					{#if block.caption}
						<figcaption class="text-muted-foreground mt-1.5 text-xs">{block.caption}</figcaption>
					{/if}
				</figure>
			{:else}
				<Separator />
			{/if}
		{:else}
			{@const name = inputName(block.id)}
			{@const error = errors[block.id]}
			{@const describedBy = error ? `${name}-error` : block.help ? `${name}-help` : undefined}

			<Field.Field data-invalid={error ? true : undefined}>
				{#if block.type === 'rating'}
					<!-- Its own <legend>, so the group is announced as one question. -->
					<StarRating
						{name}
						legend={block.label}
						required={block.required}
						value={numberValue(block.id)}
					/>
				{:else if block.type === 'radio' || block.type === 'yesNo' || block.type === 'checkboxes'}
					{@const options = block.type === 'yesNo' ? [m.form_yes(), m.form_no()] : block.options}
					{@const stored =
						block.type === 'yesNo'
							? [
									stringValue(block.id) === 'yes'
										? m.form_yes()
										: stringValue(block.id) === 'no'
											? m.form_no()
											: ''
								]
							: arrayValue(block.id)}

					<fieldset>
						<legend class="text-sm font-medium">
							{block.label}
							{#if block.required}<span class="text-destructive" aria-label="required">*</span>{/if}
						</legend>

						{#if block.type === 'checkboxes'}
							<p class="text-muted-foreground mt-0.5 text-xs">{m.form_select_all()}</p>
						{/if}

						<div class="mt-2 flex flex-col gap-2">
							{#each options as option, index (option)}
								{@const optionId = `${name}_${index}`}
								{@const optionValue =
									block.type === 'yesNo' ? (index === 0 ? 'yes' : 'no') : option}
								<label
									for={optionId}
									class="border-border hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
								>
									<input
										id={optionId}
										{name}
										type={block.type === 'checkboxes' ? 'checkbox' : 'radio'}
										value={optionValue}
										checked={stored.includes(option) || stored.includes(optionValue)}
										required={block.required && block.type !== 'checkboxes'}
										aria-describedby={describedBy}
										class="accent-primary size-4 shrink-0"
									/>
									<span>{option}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{:else}
					<Field.FieldLabel for={name}>
						{block.label}
						{#if block.required}
							<span class="text-destructive" aria-label="required">*</span>
						{:else}
							<span class="text-muted-foreground font-normal">({m.register_optional()})</span>
						{/if}
					</Field.FieldLabel>

					{#if block.type === 'paragraph'}
						<Textarea
							id={name}
							{name}
							rows={4}
							required={block.required}
							placeholder={block.placeholder ?? ''}
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={describedBy}
							value={stringValue(block.id)}
						/>
					{:else if block.type === 'dropdown'}
						<!-- Native <select>: this form submits without JavaScript. -->
						<select
							id={name}
							{name}
							required={block.required}
							class="native-select"
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={describedBy}
						>
							<option value="">{m.form_choose()}</option>
							{#each block.options as option (option)}
								<option value={option} selected={stringValue(block.id) === option}>
									{option}
								</option>
							{/each}
						</select>
					{:else}
						{@const type =
							block.type === 'email'
								? 'email'
								: block.type === 'phone'
									? 'tel'
									: block.type === 'url'
										? 'url'
										: block.type === 'number'
											? 'number'
											: block.type === 'date'
												? 'date'
												: 'text'}
						<Input
							id={name}
							{name}
							{type}
							required={block.required}
							placeholder={block.placeholder ?? ''}
							inputmode={block.type === 'phone' ? 'tel' : undefined}
							autocomplete={block.role === 'name'
								? 'name'
								: block.role === 'email'
									? 'email'
									: block.role === 'phone'
										? 'tel'
										: block.role === 'organisation'
											? 'organization'
											: undefined}
							min={block.type === 'number' && block.min !== null ? block.min : undefined}
							max={block.type === 'number' && block.max !== null ? block.max : undefined}
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={describedBy}
							value={stringValue(block.id)}
						/>
					{/if}
				{/if}

				{#if error}
					<Field.FieldError id="{name}-error">{error}</Field.FieldError>
				{:else if block.help}
					<Field.FieldDescription id="{name}-help">{block.help}</Field.FieldDescription>
				{/if}
			</Field.Field>
		{/if}
	{/each}
</Field.FieldGroup>
