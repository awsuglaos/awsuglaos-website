<script lang="ts">
	import ConfirmSubmit from '$lib/components/admin/confirm-submit.svelte';
	import { buttonVariants } from '$lib/components/ui/button';

	interface Props {
		/** Heading, e.g. "Delete article". Doubles as the trigger label. */
		title: string;
		/** What deleting actually costs. Shown on the page, before the dialog. */
		description?: string;
		/** Form action, e.g. `?/delete`. */
		action?: string;
		/** Dialog heading — the question being answered. */
		confirmTitle: string;
		/** Dialog body. Say the irreversible part out loud. */
		confirmDescription: string;
		/** Label on the button inside the dialog. */
		confirmLabel?: string;
		/** Label on the button on the page. */
		triggerLabel?: string;
	}

	let {
		title,
		description,
		action = '?/delete',
		confirmTitle,
		confirmDescription,
		confirmLabel = 'Delete',
		triggerLabel = 'Delete'
	}: Props = $props();
</script>

<!--
	Set apart from the rest of the page by a destructive-tinted border rather
	than by distance, so it cannot be mistaken for one more edit panel — and
	placed last, after everything a person came here to do.
-->
<section class="border-destructive/30 bg-destructive/5 mt-12 rounded-xl border p-5">
	<h2 class="text-destructive text-sm font-semibold">{title}</h2>
	{#if description}
		<p class="text-muted-foreground mt-1.5 max-w-prose text-sm text-pretty">{description}</p>
	{/if}

	<div class="mt-4">
		<ConfirmSubmit
			{action}
			title={confirmTitle}
			description={confirmDescription}
			{confirmLabel}
			triggerLabel={title}
			triggerClass={buttonVariants({ variant: 'destructive', size: 'sm' })}
		>
			{#snippet trigger()}{triggerLabel}{/snippet}
		</ConfirmSubmit>
	</div>
</section>
