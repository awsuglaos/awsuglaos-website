<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		AdminFormState,
		fieldValue,
		richTextValue,
		type AdminFormResult
	} from '$lib/admin-form.svelte';
	import AdminField from '$lib/components/admin/admin-field.svelte';
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import RichTextEditor from '$lib/components/admin/RichTextEditor.svelte';
	import UnsavedGuard from '$lib/components/admin/unsaved-guard.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toVientianeInput } from '$lib/datetime';
	import type { RichTextDoc } from '@awsug/shared';

	interface Translation {
		locale: 'lo' | 'en';
		title: string;
		description: RichTextDoc;
		locationName: string;
	}

	interface Props {
		event?: {
			slug: string;
			startAt: string;
			endAt: string;
			capacity: number;
			locationUrl: string;
			coverImageUrl: string | null;
			status: 'draft' | 'published';
			translations: Translation[];
		};
		/** The page's `form` prop: what the server said about the last attempt. */
		result?: AdminFormResult | null;
		/** Form action, e.g. `?/save`. Omit to post to the current URL. */
		action?: string;
		submitLabel?: string;
	}

	let { event, result = null, action, submitLabel = 'Save event' }: Props = $props();

	const formState = new AdminFormState();

	/** Typed value first, stored value second. See `fieldValue`. */
	const v = (name: string, fallback: string | number | null | undefined) =>
		fieldValue(result, name, fallback);

	function tr(locale: 'lo' | 'en'): Partial<Translation> {
		return event?.translations.find((t) => t.locale === locale) ?? {};
	}

	const locales = [
		{ code: 'lo' as const, name: 'Lao', required: true },
		{ code: 'en' as const, name: 'English', required: false }
	];

	let statusValue = $derived(v('status', event?.status ?? 'draft'));
</script>

<form
	method="POST"
	{action}
	bind:this={formState.form}
	use:enhance={formState.enhance}
	oninput={formState.markDirty}
	onchange={formState.markDirty}
>
	<div class="flex flex-col gap-6">
		<Card.Root class="[--card-spacing:--spacing(5)]">
			<Card.Header>
				<Card.Title>Schedule and capacity</Card.Title>
			</Card.Header>

			<Card.Content>
				<Field.FieldGroup>
					<div class="grid gap-5 sm:grid-cols-2">
						<AdminField
							{result}
							name="slug"
							label="Slug"
							required
							description="Lowercase letters, numbers and hyphens. Used in the public URL."
						>
							{#snippet input({ props })}
								<Input
									{...props}
									pattern="[a-z0-9]+(-[a-z0-9]+)*"
									placeholder="aws-community-day-2026"
									value={v('slug', event?.slug)}
								/>
							{/snippet}
						</AdminField>

						<AdminField {result} name="status" label="Status">
							{#snippet input({ props })}
								<!--
									A plain <select> rather than the shadcn Select: this form posts
									without JavaScript, and only a native control submits a value.
								-->
								<select {...props} class="native-select">
									<option value="draft" selected={statusValue !== 'published'}>Draft</option>
									<option value="published" selected={statusValue === 'published'}>
										Published
									</option>
								</select>
							{/snippet}
						</AdminField>

						<AdminField {result} name="startAt" label="Starts (Vientiane time)" required>
							{#snippet input({ props })}
								<Input
									{...props}
									type="datetime-local"
									value={v('startAt', event ? toVientianeInput(new Date(event.startAt)) : '')}
								/>
							{/snippet}
						</AdminField>

						<AdminField {result} name="endAt" label="Ends (Vientiane time)" required>
							{#snippet input({ props })}
								<Input
									{...props}
									type="datetime-local"
									value={v('endAt', event ? toVientianeInput(new Date(event.endAt)) : '')}
								/>
							{/snippet}
						</AdminField>

						<AdminField
							{result}
							name="capacity"
							label="Capacity"
							description="0 means unlimited — registration never auto-closes on seats."
						>
							{#snippet input({ props })}
								<Input
									{...props}
									type="number"
									min="0"
									value={v('capacity', event?.capacity ?? 0)}
								/>
							{/snippet}
						</AdminField>

						<AdminField
							{result}
							name="locationUrl"
							label="Google Maps link"
							required
							description="Paste the “Share” link from Google Maps. It is embedded on the event page, and short links are expanded when you save so the pin lands accurately."
						>
							{#snippet input({ props })}
								<Input
									{...props}
									type="url"
									placeholder="https://maps.app.goo.gl/… or google.com/maps/place/…"
									value={v('locationUrl', event?.locationUrl)}
								/>
							{/snippet}
						</AdminField>

						<Field.Field class="sm:col-span-2">
							<ImageField
								name="coverImageUrl"
								label="Cover image"
								value={v('coverImageUrl', event?.coverImageUrl)}
								help="Shown on cards and as the social share preview. 1200×630 works best."
							/>
						</Field.Field>
					</div>
				</Field.FieldGroup>
			</Card.Content>
		</Card.Root>

		{#each locales as locale (locale.code)}
			{@const t = tr(locale.code)}
			<Card.Root class="[--card-spacing:--spacing(5)]">
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						{locale.name}
						{#if locale.required}
							<span class="text-destructive" aria-label="required">*</span>
						{:else}
							<span class="text-muted-foreground text-sm font-normal">(optional)</span>
						{/if}
					</Card.Title>
				</Card.Header>

				<Card.Content>
					<Field.FieldGroup>
						<div class="grid gap-5 sm:grid-cols-2">
							<AdminField
								{result}
								name="title_{locale.code}"
								label="Title"
								required={locale.required}
							>
								{#snippet input({ props })}
									<Input {...props} lang={locale.code} value={v(`title_${locale.code}`, t.title)} />
								{/snippet}
							</AdminField>

							<AdminField {result} name="locationName_{locale.code}" label="Venue">
								{#snippet input({ props })}
									<Input
										{...props}
										lang={locale.code}
										value={v(`locationName_${locale.code}`, t.locationName)}
									/>
								{/snippet}
							</AdminField>
						</div>

						<AdminField
							{result}
							name="description_{locale.code}"
							label="Description"
							description="Headings, lists, tables, links and images. Images upload as you insert them."
						>
							{#snippet input({ props })}
								<RichTextEditor
									name="description_{locale.code}"
									value={richTextValue(result, `description_${locale.code}`, t.description)}
									label="Description ({locale.name})"
									describedBy={props['aria-describedby'] as string | undefined}
								/>
							{/snippet}
						</AdminField>
					</Field.FieldGroup>
				</Card.Content>
			</Card.Root>
		{/each}

		<!-- Sticky: this form runs several screens long with two editors open. -->
		<div
			class="bg-background/85 sticky bottom-0 -mx-4 flex items-center gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
		>
			<Button type="submit" disabled={formState.submitting}>
				{#if formState.submitting}<Spinner data-icon="inline-start" />{/if}
				{formState.submitting ? 'Saving…' : submitLabel}
			</Button>
			<Button href="/admin/events" variant="ghost">Cancel</Button>

			{#if formState.dirty && !formState.submitting}
				<span class="text-muted-foreground ml-auto text-xs">Unsaved changes</span>
			{/if}
		</div>
	</div>
</form>

<UnsavedGuard dirty={formState.dirty} />
