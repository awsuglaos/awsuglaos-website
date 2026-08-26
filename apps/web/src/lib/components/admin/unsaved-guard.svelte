<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { buttonVariants } from '$lib/components/ui/button';

	interface Props {
		/** True once something has been edited and not yet saved. */
		dirty: boolean;
		title?: string;
		description?: string;
	}

	let {
		dirty,
		title = 'Leave without saving?',
		description = 'This page has changes that have not been saved. Leaving now discards them.'
	}: Props = $props();

	let pending = $state<URL | null>(null);

	/*
	 * `beforeNavigate` has to decide synchronously, so the navigation is
	 * cancelled first and replayed after the answer arrives — rather than asking
	 * through `window.confirm`, which cannot be styled and, on some mobile
	 * browsers, can be suppressed outright. A suppressed guard here means the
	 * work is simply gone, so the native dialog is the wrong tool twice over.
	 * Same reasoning as confirm-submit.svelte.
	 */
	let leaving = false;

	beforeNavigate((navigation) => {
		if (!dirty || leaving || !navigation.to) return;

		// A reload or a tab close is not ours to intercept; `beforeunload` below
		// covers those with the browser's own prompt, which is the only option.
		if (navigation.type === 'leave') return;

		/*
		 * Nor is a form submission. These pages carry more than one form — the
		 * record's own, and the delete inside its danger zone — and a submit is
		 * the user committing something, not wandering off with it unsaved.
		 *
		 * Cancelling one would be actively wrong rather than merely annoying:
		 * `leave()` resumes by calling `goto`, which would re-issue a POST action
		 * URL as a GET. Deleting an event you had just edited would silently do
		 * nothing at all.
		 */
		if (navigation.type === 'form') return;

		navigation.cancel();
		pending = navigation.to.url;
	});

	function leave() {
		const url = pending;
		pending = null;
		leaving = true;
		if (url) goto(url);
	}

	$effect(() => {
		if (!dirty) return;

		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};

		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});
</script>

<AlertDialog.Root
	open={pending !== null}
	onOpenChange={(open) => {
		if (!open) pending = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>

		<AlertDialog.Footer>
			<AlertDialog.Cancel>Stay on this page</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} onclick={leave}>
				Discard changes
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
