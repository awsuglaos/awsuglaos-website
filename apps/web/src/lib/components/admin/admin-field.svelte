<script lang="ts">
	import { fieldError, type AdminFormResult } from '$lib/admin-form.svelte';
	import * as Field from '$lib/components/ui/field';
	import type { Snippet } from 'svelte';

	interface Props {
		/** The `form` prop from the page, carrying any rejection. */
		result?: AdminFormResult | null;
		/** Input name. Doubles as the id and as the key into `fieldErrors`. */
		name: string;
		label?: string;
		description?: string;
		required?: boolean;
		class?: string;
		/** The control itself. Spread `props` onto it. */
		input: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let {
		result = null,
		name,
		label,
		description,
		required = false,
		class: className,
		input
	}: Props = $props();

	let error = $derived(fieldError(result, name));
	let describedBy = $derived(error ? `${name}-error` : description ? `${name}-help` : undefined);
</script>

<!--
	One field, wired to the server's answer.
	
	The id, the `aria-invalid` flag and the `aria-describedby` link are derived
	from the field name in one place rather than repeated at every input, because
	they were repeated at every input and so were absent from most of them. The
	error replaces the help text rather than stacking beneath it: once something
	is wrong, the correction is the only line worth reading.
-->
<Field.Field data-invalid={error ? true : undefined} class={className}>
	{#if label}
		<Field.FieldLabel for={name}>
			{label}
			{#if required}<span class="text-destructive" aria-label="required">*</span>{/if}
		</Field.FieldLabel>
	{/if}

	{@render input({
		props: {
			id: name,
			name,
			required,
			'aria-invalid': error ? 'true' : undefined,
			'aria-describedby': describedBy
		}
	})}

	{#if error}
		<Field.FieldError id="{name}-error">{error}</Field.FieldError>
	{:else if description}
		<Field.FieldDescription id="{name}-help">{description}</Field.FieldDescription>
	{/if}
</Field.Field>
