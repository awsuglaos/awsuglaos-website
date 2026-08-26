<script lang="ts">
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import PhotoUploader from '$lib/components/admin/PhotoUploader.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { uploadFile } from '$lib/upload';
	import { ALLOWED_DOCUMENT_TYPES, resourceKindSchema, type ResourceKind } from '@awsug/shared';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import FileText from '@lucide/svelte/icons/file-text';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';

	let { data, form } = $props();

	let eventTitle = $derived(
		data.event.translations.find((t) => t.locale === 'lo')?.title ?? data.event.slug
	);

	/**
	 * Materials only become visible to visitors once the event is over. Showing
	 * that state here means an organiser uploading slides the night before is not
	 * left wondering why the public page looks unchanged.
	 */
	let published = $derived(new Date(data.event.endAt) <= new Date());

	const kinds = resourceKindSchema.options;

	interface ResourceRow {
		title: string;
		kind: ResourceKind;
		url: string;
		sizeBytes: number | null;
		contentType: string | null;
	}

	let resources = $state<ResourceRow[]>(
		data.resources.map((r) => ({
			title: r.title,
			kind: r.kind,
			url: r.url,
			sizeBytes: r.sizeBytes,
			contentType: r.contentType
		}))
	);

	let photos = $state(data.photos.map((p) => ({ url: p.url, caption: p.caption })));

	let uploadingIndex = $state<number | null>(null);
	let uploadError = $state('');

	function addResource() {
		resources = [
			...resources,
			{ title: '', kind: 'document', url: '', sizeBytes: null, contentType: null }
		];
	}

	async function onResourceFile(index: number, input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file) return;

		uploadError = '';
		uploadingIndex = index;
		try {
			const url = await uploadFile(file, 'document');
			// Size and type come from the file we just stored, so the public page
			// can show "PDF · 2.4MB" without fetching it to find out.
			resources[index] = {
				...resources[index]!,
				url,
				sizeBytes: file.size,
				contentType: file.type,
				title: resources[index]!.title || file.name.replace(/\.[^.]+$/, '')
			};
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Upload failed';
		} finally {
			uploadingIndex = null;
			input.value = '';
		}
	}

	/** Clearing the URL also clears what we knew about the stored file. */
	function onUrlEdited(index: number, value: string) {
		const previous = resources[index]!;
		const isUpload = value.startsWith('/uploads/');
		resources[index] = {
			...previous,
			url: value,
			sizeBytes: isUpload ? previous.sizeBytes : null,
			contentType: isUpload ? previous.contentType : null
		};
	}
</script>

<Seo title="Materials" noindex />

<PageHeader title="Materials" description={eventTitle}>
	{#snippet actions()}
		<Button variant="outline" href="/admin/events/{data.event.id}">
			<ArrowLeft class="mr-2 size-4" /> Back to event
		</Button>
	{/snippet}
</PageHeader>

<FormAlert {form} />

{#if !published}
	<div class="border-muted bg-muted/40 text-muted-foreground mt-4 rounded-md border p-3 text-sm">
		This event has not finished yet, so nothing here is visible on the public page. Everything below
		appears automatically once the end time passes.
	</div>
{/if}

{#if uploadError}
	<div
		class="border-destructive/40 bg-destructive/5 text-destructive mt-4 rounded-md border p-3 text-sm"
	>
		{uploadError}
	</div>
{/if}

<!-- Resources ------------------------------------------------------------- -->
<Card.Root class="mt-6">
	<Card.Header>
		<Card.Title>Resources</Card.Title>
		<Card.Description>
			Slides, handouts, demo repositories and recordings. Each row is either an uploaded file or a
			link — source code usually belongs in its repository rather than a zip.
		</Card.Description>
	</Card.Header>

	<Card.Content>
		<form method="POST" action="?/resources" class="space-y-4">
			{#each resources as row, index (index)}
				<div class="flex flex-wrap items-end gap-3 border-b pb-4 last:border-b-0">
					<input type="hidden" name="resourceSize" value={row.sizeBytes ?? ''} />
					<input type="hidden" name="resourceContentType" value={row.contentType ?? ''} />

					<div class="min-w-48 flex-1">
						<Label for="title_{index}">Title</Label>
						<Input
							id="title_{index}"
							name="resourceTitle"
							bind:value={resources[index]!.title}
							placeholder="Serverless workshop slides"
							required
						/>
					</div>

					<div>
						<Label for="kind_{index}">Type</Label>
						<select
							id="kind_{index}"
							name="resourceKind"
							bind:value={resources[index]!.kind}
							class="native-select w-auto"
						>
							{#each kinds as kind (kind)}
								<option value={kind}>{kind}</option>
							{/each}
						</select>
					</div>

					<div class="min-w-64 flex-1">
						<Label for="url_{index}">File or link</Label>
						<div class="flex gap-2">
							<!-- text, not url: uploads are stored site-relative and the
							     browser's URL validation would reject them outright. -->
							<Input
								id="url_{index}"
								name="resourceUrl"
								type="text"
								value={row.url}
								oninput={(e) => onUrlEdited(index, e.currentTarget.value)}
								placeholder="https://github.com/… or upload"
								required
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								aria-label="Upload a file for {row.title || `resource ${index + 1}`}"
								disabled={uploadingIndex === index}
								onclick={(e) =>
									(e.currentTarget as HTMLElement).parentElement
										?.querySelector<HTMLInputElement>('input[type=file]')
										?.click()}
							>
								<Upload />
							</Button>
							<input
								type="file"
								accept={ALLOWED_DOCUMENT_TYPES.join(',')}
								class="sr-only"
								onchange={(e) => onResourceFile(index, e.currentTarget)}
							/>
						</div>
					</div>

					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Remove {row.title || `resource ${index + 1}`}"
						onclick={() => (resources = resources.filter((_, i) => i !== index))}
					>
						<Trash2 />
					</Button>
				</div>
			{:else}
				<Empty.Root class="py-4">
					<Empty.Header>
						<Empty.Media variant="icon"><FileText /></Empty.Media>
						<Empty.Description>No resources on this event yet.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/each}

			<div class="flex items-center gap-2">
				<Button type="button" variant="outline" onclick={addResource}>
					<Plus class="mr-2 size-4" /> Add resource
				</Button>
				<Button type="submit">Save resources</Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>

<!-- Photos ---------------------------------------------------------------- -->
<Card.Root class="mt-6">
	<Card.Header>
		<Card.Title>Photos</Card.Title>
		<Card.Description>Pictures from the day, shown as a gallery on the event page.</Card.Description
		>
	</Card.Header>

	<Card.Content>
		<form method="POST" action="?/photos" class="space-y-4">
			<PhotoUploader bind:photos />
			<Button type="submit">Save photos</Button>
		</form>
	</Card.Content>
</Card.Root>
