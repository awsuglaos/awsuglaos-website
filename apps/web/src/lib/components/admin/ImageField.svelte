<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ALLOWED_IMAGE_TYPES } from '@awsug/shared';
	import { uploadImage } from '$lib/upload';
	import { ImagePlus, X } from '@lucide/svelte';

	interface Props {
		name: string;
		label: string;
		value?: string | null;
		help?: string;
		required?: boolean;
		/** Rounded preview, for avatars and speaker photos. */
		circular?: boolean;
		/**
		 * Called whenever the URL changes, by upload, paste or clear. The form
		 * builder needs the value as state rather than as a posted field, since it
		 * submits every block in one JSON payload.
		 */
		onChange?: (url: string) => void;
	}

	let {
		name,
		label,
		value = null,
		help,
		required = false,
		circular = false,
		onChange
	}: Props = $props();

	let url = $state(value ?? '');
	let uploading = $state(false);
	let uploadError = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);

	async function onFileChosen() {
		const file = fileInput?.files?.[0];
		if (!file) return;

		uploadError = '';
		uploading = true;
		try {
			url = await uploadImage(file);
			onChange?.(url);
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Upload failed';
		} finally {
			uploading = false;
			// Reset so choosing the same file twice still fires a change event.
			if (fileInput) fileInput.value = '';
		}
	}
</script>

<div>
	<Label for={name}>
		{label}
		{#if required}<span class="text-destructive">*</span>{/if}
	</Label>

	<div class="mt-1.5 flex gap-2">
		<!--
			The URL stays an editable text field rather than being hidden behind the
			upload button — pasting a link to an image hosted elsewhere is a
			perfectly good answer, and removing that would make the field worse.
		-->
		<!--
			`type="text"`, not `type="url"`: uploaded images are stored site-relative
			("/uploads/…"), which the browser's URL validation rejects outright — the
			form would silently refuse to submit. `imageUrlSchema` on the server
			accepts both shapes and is the real check.
		-->
		<Input
			id={name}
			{name}
			type="text"
			inputmode="url"
			{required}
			bind:value={url}
			oninput={() => onChange?.(url)}
			placeholder="Upload, or paste an image URL"
			class="flex-1"
		/>

		<!--
			A real input in the DOM rather than one built on the fly: a detached
			element's click does not reliably open a file chooser, and this way the
			control is also reachable by assistive tech and by tests.
		-->
		<input
			bind:this={fileInput}
			id="{name}_file"
			type="file"
			accept={ALLOWED_IMAGE_TYPES.join(',')}
			class="sr-only"
			aria-label="{label} file"
			onchange={onFileChosen}
		/>
		<Button type="button" variant="outline" onclick={() => fileInput?.click()} disabled={uploading}>
			<ImagePlus class="size-4" />
			{uploading ? 'Uploading…' : 'Upload'}
		</Button>
	</div>

	{#if url}
		<div class="border-border mt-2 flex items-center gap-3 rounded-lg border p-2">
			<img
				src={url}
				alt=""
				class={circular
					? 'size-16 rounded-full object-cover'
					: 'h-16 w-auto rounded object-contain'}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={() => {
					url = '';
					onChange?.('');
				}}
			>
				<X class="size-4" />
				Remove
			</Button>
		</div>
	{/if}

	{#if uploadError}
		<p class="text-destructive mt-1 text-xs" role="alert">{uploadError}</p>
	{:else if help}
		<p class="text-muted-foreground mt-1 text-xs">{help}</p>
	{/if}
</div>
