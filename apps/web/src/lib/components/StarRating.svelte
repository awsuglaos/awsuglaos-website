<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		name: string;
		legend: string;
		required?: boolean;
		value?: number | null;
	}

	let { name, legend, required = false, value = null }: Props = $props();

	const stars = [1, 2, 3, 4, 5];
</script>

<!--
	Real radio inputs rather than buttons: this posts and validates without any
	JavaScript, arrow keys move between options for free, and screen readers
	announce it as the grouped choice it is. The stars are styling on top of the
	labels, not a replacement for the control.
-->
<fieldset>
	<legend class="text-sm font-medium">
		{legend}
		{#if required}<span class="text-destructive">*</span>{/if}
	</legend>

	<div class="mt-1.5 flex flex-row-reverse justify-end gap-1">
		{#each [...stars].reverse() as star (star)}
			<input
				type="radio"
				id="{name}_{star}"
				{name}
				{required}
				value={star}
				checked={value === star}
				class="peer sr-only"
			/>
			<label
				for="{name}_{star}"
				title={m.star_rating({ n: star })}
				class="text-muted-foreground/40 hover:text-primary peer-checked:text-primary peer-focus-visible:outline-ring cursor-pointer text-2xl leading-none transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
			>
				<span aria-hidden="true">★</span>
				<span class="sr-only">{m.star_rating({ n: star })}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	/*
	 * Row-reverse plus the sibling selector gives "fill up to the chosen star"
	 * with no JavaScript: in reversed DOM order, the stars *before* the checked
	 * one in the markup are the ones visually to its left.
	 */
	label:hover,
	label:hover ~ label,
	input:checked ~ label {
		color: var(--primary);
	}
</style>
