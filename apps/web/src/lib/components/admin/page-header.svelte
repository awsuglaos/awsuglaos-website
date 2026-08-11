<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** One sentence on what this screen is for. Optional. */
		description?: string;
		/** Primary actions, right-aligned on wide screens. */
		actions?: Snippet;
	}

	let { title, description, actions }: Props = $props();
</script>

<!--
	Every backoffice screen opens the same way, so the rhythm is defined once here rather
	than re-typed on eighteen pages. Actions wrap under the title on a phone instead of
	squeezing it.

	The rule underneath is the one thing this shares with the public redesign: a hairline
	that separates the header from the work, so the screen has a visible top edge without
	wrapping everything in another card. The backoffice is an Operate surface — it keeps
	its sidebar, its density and its plain controls, and nothing here is decorative.
-->
<div
	class="border-border flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b pb-5"
>
	<div class="min-w-0">
		<h1 class="text-2xl font-bold tracking-tight text-balance">{title}</h1>
		{#if description}
			<p class="text-muted-foreground mt-2 max-w-2xl text-sm text-pretty">{description}</p>
		{/if}
	</div>

	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</div>
