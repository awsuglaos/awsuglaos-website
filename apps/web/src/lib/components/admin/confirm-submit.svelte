<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Form action, e.g. `?/delete`. Omit to post to the current URL. */
		action?: string;
		/** Dialog heading — phrase it as the question being answered. */
		title: string;
		/** What will actually happen. Say the irreversible part out loud. */
		description: string;
		/** Label on the confirming button. A verb, not "OK". */
		confirmLabel?: string;
		cancelLabel?: string;
		/** Accessible name for the trigger when it renders as an icon only. */
		triggerLabel: string;
		/** Trigger contents — usually an icon, sometimes text. */
		trigger: Snippet;
		/** Overrides the default ghost icon button, e.g. for a labelled trigger. */
		triggerClass?: string;
		/** Hidden inputs the action needs, e.g. the record id. */
		children?: Snippet;
		class?: string;
	}

	let {
		action,
		title,
		description,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		triggerLabel,
		trigger,
		triggerClass,
		children,
		class: className
	}: Props = $props();

	let formEl = $state<HTMLFormElement | null>(null);
</script>

<!--
	Replaces `window.confirm`. The native dialog cannot be styled, reads as a
	browser-level warning rather than part of the app, and on some mobile
	browsers can be suppressed entirely — which would turn a destructive action
	into a single unguarded tap.

	The form is real and submits normally, so this still works as a plain POST.
-->
<form bind:this={formEl} method="POST" {action} class={cn('inline', className)}>
	{@render children?.()}

	<AlertDialog.Root>
		<!--
			`type="button"` is load-bearing. bits-ui does not set it on the trigger,
			and a bare <button> inside a <form> defaults to type="submit" — the
			trigger would post the destructive action at the same moment it opened
			the dialog asking whether to post it.
		-->
		<AlertDialog.Trigger
			type="button"
			class={triggerClass ?? buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
			aria-label={triggerLabel}
		>
			{@render trigger()}
		</AlertDialog.Trigger>

		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{title}</AlertDialog.Title>
				<AlertDialog.Description>{description}</AlertDialog.Description>
			</AlertDialog.Header>

			<AlertDialog.Footer>
				<AlertDialog.Cancel>{cancelLabel}</AlertDialog.Cancel>
				<AlertDialog.Action
					class={buttonVariants({ variant: 'destructive' })}
					onclick={() => formEl?.requestSubmit()}
				>
					{confirmLabel}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</form>
