<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Empty from '$lib/components/ui/empty';
	import { Progress } from '$lib/components/ui/progress';
	import { uploadAll } from '$lib/upload';
	import { ALLOWED_IMAGE_TYPES } from '@awsug/shared';
	import Images from '@lucide/svelte/icons/images';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	interface Photo {
		url: string;
		caption: string | null;
	}

	interface Props {
		photos: Photo[];
	}

	let { photos = $bindable() }: Props = $props();

	let uploading = $state(false);
	let done = $state(0);
	let total = $state(0);
	/** One message per file that failed, so a bad file names itself. */
	let failures = $state<string[]>([]);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function onFilesChosen() {
		const chosen = Array.from(fileInput?.files ?? []);
		if (chosen.length === 0) return;

		failures = [];
		done = 0;
		total = chosen.length;
		uploading = true;

		try {
			const results = await uploadAll(chosen, 'image', (d) => (done = d));

			/*
			 * Partial success is the normal case with a batch, not an exception:
			 * append everything that worked and report only what did not, so one
			 * oversized photo out of twenty does not discard the other nineteen.
			 */
			photos = [
				...photos,
				...results
					.filter((r) => r.url)
					.map((r) => ({ url: r.url as string, caption: null as string | null }))
			];
			failures = results.filter((r) => r.error).map((r) => `${r.file.name}: ${r.error}`);
		} finally {
			uploading = false;
			// Reset so choosing the same files again still fires a change event.
			if (fileInput) fileInput.value = '';
		}
	}
</script>

<div class="space-y-4">
	<div>
		<input
			bind:this={fileInput}
			type="file"
			accept={ALLOWED_IMAGE_TYPES.join(',')}
			multiple
			class="sr-only"
			id="event-photos"
			onchange={onFilesChosen}
			disabled={uploading}
		/>
		<Button type="button" variant="outline" disabled={uploading} onclick={() => fileInput?.click()}>
			<Images class="mr-2 size-4" />
			{uploading ? `Uploading ${done} of ${total}…` : 'Add photos'}
		</Button>
		<p class="text-muted-foreground mt-1.5 text-xs">
			Choose several at once. They upload three at a time so a slow connection does not stall.
		</p>
	</div>

	{#if uploading && total > 0}
		<Progress value={(done / total) * 100} />
	{/if}

	{#if failures.length > 0}
		<div class="border-destructive/40 bg-destructive/5 rounded-md border p-3">
			<p class="text-destructive text-sm font-medium">
				{failures.length} file{failures.length === 1 ? '' : 's'} could not be uploaded
			</p>
			<ul class="text-destructive/90 mt-1 space-y-0.5 text-xs">
				{#each failures as failure (failure)}
					<li>{failure}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if photos.length > 0}
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{#each photos as photo, index (photo.url)}
				<li class="space-y-1.5">
					<div class="bg-muted relative overflow-hidden rounded-md border">
						<input type="hidden" name="photoUrl" value={photo.url} />
						<!-- Dimensions are unknown until the browser loads it; the fixed
						     aspect box is what stops the grid reflowing as they arrive. -->
						<img src={photo.url} alt="" loading="lazy" class="aspect-4/3 w-full object-cover" />
						<Button
							type="button"
							variant="destructive"
							size="icon-sm"
							class="absolute top-1 right-1"
							aria-label="Remove photo {index + 1}"
							onclick={() => (photos = photos.filter((_, i) => i !== index))}
						>
							<Trash2 />
						</Button>
					</div>
					<Label for="caption_{index}" class="sr-only">Caption for photo {index + 1}</Label>
					<Input
						id="caption_{index}"
						name="photoCaption"
						value={photo.caption ?? ''}
						placeholder="Caption (optional)"
						class="h-8 text-xs"
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<Empty.Root class="py-6">
			<Empty.Header>
				<Empty.Media variant="icon"><Images /></Empty.Media>
				<Empty.Description>No photos yet.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>
