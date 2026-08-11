<script lang="ts">
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import RichTextEditor from '$lib/components/admin/RichTextEditor.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { RichTextDoc } from '@awsug/shared';

	interface Translation {
		locale: 'lo' | 'en';
		title: string;
		excerpt: string | null;
		content: RichTextDoc;
	}

	interface Props {
		article?: {
			slug: string;
			category: string | null;
			coverImageUrl: string | null;
			status: 'draft' | 'published';
			translations: Translation[];
		};
		submitLabel?: string;
	}

	let { article, submitLabel = 'Save article' }: Props = $props();

	function tr(locale: 'lo' | 'en'): Partial<Translation> {
		return article?.translations.find((t) => t.locale === locale) ?? {};
	}

	const locales = [
		{ code: 'lo' as const, name: 'Lao', required: true },
		{ code: 'en' as const, name: 'English', required: false }
	];
</script>

<div class="flex flex-col gap-6">
	<Card.Root class="[--card-spacing:--spacing(5)]">
		<Card.Header>
			<Card.Title>Details</Card.Title>
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
							value={article?.slug ?? ''}
						/>
						<Field.FieldDescription>Lower case, words joined by hyphens.</Field.FieldDescription>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="status">Status</Field.FieldLabel>
						<!-- Native <select>: posts without JS, and the e2e suite drives it. -->
						<select id="status" name="status" class="native-select">
							<option value="draft" selected={article?.status !== 'published'}>Draft</option>
							<option value="published" selected={article?.status === 'published'}>
								Published
							</option>
						</select>
						<Field.FieldDescription>
							Publishing stamps the date the first time only.
						</Field.FieldDescription>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="category">Category</Field.FieldLabel>
						<Input
							id="category"
							name="category"
							placeholder="Community, Tutorial…"
							value={article?.category ?? ''}
						/>
					</Field.Field>

					<Field.Field>
						<ImageField
							name="coverImageUrl"
							label="Cover image"
							value={article?.coverImageUrl ?? ''}
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
						<Field.FieldLabel for="excerpt_{locale.code}">Excerpt</Field.FieldLabel>
						<Textarea
							id="excerpt_{locale.code}"
							name="excerpt_{locale.code}"
							lang={locale.code}
							rows={2}
							maxlength={320}
							value={t.excerpt ?? ''}
						/>
						<Field.FieldDescription>
							Shown on cards and used as the social share description.
						</Field.FieldDescription>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="content_{locale.code}">Content</Field.FieldLabel>
						<RichTextEditor
							name="content_{locale.code}"
							value={t.content ?? null}
							label="Content ({locale.name})"
							describedBy="content_help_{locale.code}"
						/>
						<Field.FieldDescription id="content_help_{locale.code}">
							Headings, lists, tables, links and images. Images upload as you insert them.
						</Field.FieldDescription>
					</Field.Field>
				</Field.FieldGroup>
			</Card.Content>
		</Card.Root>
	{/each}

	<!--
		Sticky so the save button stays reachable: with two rich-text editors open
		this form runs several screens long, and a submit at the very bottom means
		scrolling past everything to commit a one-word fix.
	-->
	<div
		class="bg-background/85 sticky bottom-0 -mx-4 flex gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
	>
		<Button type="submit">{submitLabel}</Button>
		<Button href="/admin/articles" variant="ghost">Cancel</Button>
	</div>
</div>
