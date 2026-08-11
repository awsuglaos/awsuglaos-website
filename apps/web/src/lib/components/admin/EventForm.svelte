<script lang="ts">
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import RichTextEditor from '$lib/components/admin/RichTextEditor.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
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
		submitLabel?: string;
	}

	let { event, submitLabel = 'Save event' }: Props = $props();

	function tr(locale: 'lo' | 'en'): Partial<Translation> {
		return event?.translations.find((t) => t.locale === locale) ?? {};
	}

	const locales = [
		{ code: 'lo' as const, name: 'Lao', required: true },
		{ code: 'en' as const, name: 'English', required: false }
	];
</script>

<div class="flex flex-col gap-6">
	<Card.Root class="[--card-spacing:--spacing(5)]">
		<Card.Header>
			<Card.Title>Schedule and capacity</Card.Title>
		</Card.Header>

		<Card.Content>
			<Field.FieldGroup>
				<div class="grid gap-5 sm:grid-cols-2">
					<Field.Field>
						<Field.FieldLabel for="slug">Slug</Field.FieldLabel>
						<Input
							id="slug"
							name="slug"
							required
							pattern="[a-z0-9]+(-[a-z0-9]+)*"
							placeholder="aws-community-day-2026"
							value={event?.slug ?? ''}
						/>
						<Field.FieldDescription>
							Lowercase letters, numbers and hyphens. Used in the public URL.
						</Field.FieldDescription>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="status">Status</Field.FieldLabel>
						<!--
							A plain <select> rather than the shadcn Select: this form posts
							without JavaScript, and only a native control submits a value.
						-->
						<select id="status" name="status" class="native-select">
							<option value="draft" selected={event?.status !== 'published'}>Draft</option>
							<option value="published" selected={event?.status === 'published'}>
								Published
							</option>
						</select>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="startAt">Starts (Vientiane time)</Field.FieldLabel>
						<Input
							id="startAt"
							name="startAt"
							type="datetime-local"
							required
							value={event ? toVientianeInput(new Date(event.startAt)) : ''}
						/>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="endAt">Ends (Vientiane time)</Field.FieldLabel>
						<Input
							id="endAt"
							name="endAt"
							type="datetime-local"
							required
							value={event ? toVientianeInput(new Date(event.endAt)) : ''}
						/>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="capacity">Capacity</Field.FieldLabel>
						<Input id="capacity" name="capacity" type="number" min="0" value={event?.capacity ?? 0} />
						<Field.FieldDescription>
							0 means unlimited — registration never auto-closes on seats.
						</Field.FieldDescription>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="locationUrl">
							Google Maps link <span class="text-destructive" aria-label="required">*</span>
						</Field.FieldLabel>
						<Input
							id="locationUrl"
							name="locationUrl"
							type="url"
							required
							placeholder="https://maps.app.goo.gl/… or google.com/maps/place/…"
							value={event?.locationUrl ?? ''}
						/>
						<Field.FieldDescription>
							Paste the "Share" link from Google Maps. It is embedded on the event page, and
							short links are expanded when you save so the pin lands accurately.
						</Field.FieldDescription>
					</Field.Field>

					<Field.Field class="sm:col-span-2">
						<ImageField
							name="coverImageUrl"
							label="Cover image"
							value={event?.coverImageUrl ?? ''}
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
						<Field.Field>
							<Field.FieldLabel for="title_{locale.code}">Title</Field.FieldLabel>
							<Input
								id="title_{locale.code}"
								name="title_{locale.code}"
								lang={locale.code}
								required={locale.required}
								value={t.title ?? ''}
							/>
						</Field.Field>

						<Field.Field>
							<Field.FieldLabel for="locationName_{locale.code}">Venue</Field.FieldLabel>
							<Input
								id="locationName_{locale.code}"
								name="locationName_{locale.code}"
								lang={locale.code}
								value={t.locationName ?? ''}
							/>
						</Field.Field>
					</div>

					<Field.Field>
						<Field.FieldLabel for="description_{locale.code}">Description</Field.FieldLabel>
						<RichTextEditor
							name="description_{locale.code}"
							value={t.description ?? null}
							label="Description ({locale.name})"
							describedBy="description_help_{locale.code}"
						/>
						<Field.FieldDescription id="description_help_{locale.code}">
							Headings, lists, tables, links and images. Images upload as you insert them.
						</Field.FieldDescription>
					</Field.Field>
				</Field.FieldGroup>
			</Card.Content>
		</Card.Root>
	{/each}

	<!-- Sticky: this form runs several screens long with two editors open. -->
	<div
		class="bg-background/85 sticky bottom-0 -mx-4 flex gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
	>
		<Button type="submit">{submitLabel}</Button>
		<Button href="/admin/events" variant="ghost">Cancel</Button>
	</div>
</div>
