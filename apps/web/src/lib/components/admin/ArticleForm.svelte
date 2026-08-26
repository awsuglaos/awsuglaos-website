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
		result?: AdminFormResult | null;
		action?: string;
		submitLabel?: string;
	}

	let { article, result = null, action, submitLabel = 'Save article' }: Props = $props();

	const formState = new AdminFormState();

	const v = (name: string, fallback: string | number | null | undefined) =>
		fieldValue(result, name, fallback);

	function tr(locale: 'lo' | 'en'): Partial<Translation> {
		return article?.translations.find((t) => t.locale === locale) ?? {};
	}

	const locales = [
		{ code: 'lo' as const, name: 'Lao', required: true },
		{ code: 'en' as const, name: 'English', required: false }
	];

	let statusValue = $derived(v('status', article?.status ?? 'draft'));
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
				<Card.Title>Details</Card.Title>
			</Card.Header>

			<Card.Content>
				<Field.FieldGroup>
					<div class="grid gap-5 sm:grid-cols-2">
						<AdminField
							{result}
							name="slug"
							label="Slug"
							required
							description="Lower case, words joined by hyphens."
						>
							{#snippet input({ props })}
								<Input
									{...props}
									pattern="[a-z0-9]+(-[a-z0-9]+)*"
									value={v('slug', article?.slug)}
								/>
							{/snippet}
						</AdminField>

						<AdminField
							{result}
							name="status"
							label="Status"
							description="Publishing stamps the date the first time only."
						>
							{#snippet input({ props })}
								<!-- Native <select>: posts without JS, and the e2e suite drives it. -->
								<select {...props} class="native-select">
									<option value="draft" selected={statusValue !== 'published'}>Draft</option>
									<option value="published" selected={statusValue === 'published'}>
										Published
									</option>
								</select>
							{/snippet}
						</AdminField>

						<AdminField {result} name="category" label="Category">
							{#snippet input({ props })}
								<Input
									{...props}
									placeholder="Community, Tutorial…"
									value={v('category', article?.category)}
								/>
							{/snippet}
						</AdminField>

						<Field.Field>
							<ImageField
								name="coverImageUrl"
								label="Cover image"
								value={v('coverImageUrl', article?.coverImageUrl)}
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

						<AdminField
							{result}
							name="excerpt_{locale.code}"
							label="Excerpt"
							description="Shown on cards and used as the social share description."
						>
							{#snippet input({ props })}
								<Textarea
									{...props}
									lang={locale.code}
									rows={2}
									maxlength={320}
									value={v(`excerpt_${locale.code}`, t.excerpt)}
								/>
							{/snippet}
						</AdminField>

						<AdminField
							{result}
							name="content_{locale.code}"
							label="Content"
							description="Headings, lists, tables, links and images. Images upload as you insert them."
						>
							{#snippet input({ props })}
								<RichTextEditor
									name="content_{locale.code}"
									value={richTextValue(result, `content_${locale.code}`, t.content)}
									label="Content ({locale.name})"
									describedBy={props['aria-describedby'] as string | undefined}
								/>
							{/snippet}
						</AdminField>
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
			class="bg-background/85 sticky bottom-0 -mx-4 flex items-center gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
		>
			<Button type="submit" disabled={formState.submitting}>
				{#if formState.submitting}<Spinner data-icon="inline-start" />{/if}
				{formState.submitting ? 'Saving…' : submitLabel}
			</Button>
			<Button href="/admin/articles" variant="ghost">Cancel</Button>

			{#if formState.dirty && !formState.submitting}
				<span class="text-muted-foreground ml-auto text-xs">Unsaved changes</span>
			{/if}
		</div>
	</div>
</form>

<UnsavedGuard dirty={formState.dirty} />
