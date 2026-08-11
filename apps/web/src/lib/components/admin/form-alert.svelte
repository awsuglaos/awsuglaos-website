<script lang="ts">
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	interface Props {
		/** The `form` prop from `$props()`. */
		form: { message?: string } | null | undefined;
		/** Messages that mean success. Anything else renders as an error. */
		successMessages?: string[];
		class?: string;
	}

	let { form, successMessages = ['Saved.'], class: className = 'mt-4' }: Props = $props();

	let message = $derived(form?.message);
	let ok = $derived(!!message && successMessages.includes(message));
</script>

<!--
	Server-rendered rather than a toast. These forms post normally and the whole
	page reloads, so the result arrives as part of the document — a toast would
	need JavaScript to appear at all, and this backoffice is built to work
	without it (see the plain GET search and the no-JS registration flow). It
	also stays on screen, which a transient toast does not.
-->
{#if message}
	<Alert variant={ok ? 'default' : 'destructive'} class={className}>
		{#if ok}
			<CircleCheck class="size-4" />
		{:else}
			<AlertCircle class="size-4" />
		{/if}
		<AlertDescription>{message}</AlertDescription>
	</Alert>
{/if}
