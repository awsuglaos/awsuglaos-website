<script lang="ts">
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Translation {
		locale: 'lo' | 'en';
		name: string;
		title: string | null;
		bio: string | null;
	}

	interface Props {
		speaker?: {
			slug: string;
			photoUrl: string | null;
			company: string | null;
			websiteUrl: string | null;
			linkedinUrl: string | null;
			githubUrl: string | null;
			translations: Translation[];
		};
		submitLabel?: string;
	}

	let { speaker, submitLabel = 'Save speaker' }: Props = $props();

	function tr(locale: 'lo' | 'en'): Partial<Translation> {
		return speaker?.translations.find((t) => t.locale === locale) ?? {};
	}

	const locales = [
		{ code: 'lo' as const, name: 'Lao', required: true },
		{ code: 'en' as const, name: 'English', required: false }
	];
</script>

<div class="flex flex-col gap-6">
	<Card.Root class="[--card-spacing:--spacing(5)]">
		<Card.Header>
			<Card.Title>Profile</Card.Title>
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
							placeholder="somchai-vongphachanh"
							value={speaker?.slug ?? ''}
						/>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="company">Company</Field.FieldLabel>
						<Input id="company" name="company" value={speaker?.company ?? ''} />
					</Field.Field>

					<Field.Field class="sm:col-span-2">
						<ImageField
							name="photoUrl"
							label="Photo"
							value={speaker?.photoUrl ?? ''}
							circular
							help="Square images look best — they are shown as a circle."
						/>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="websiteUrl">Website</Field.FieldLabel>
						<Input id="websiteUrl" name="websiteUrl" type="url" value={speaker?.websiteUrl ?? ''} />
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="linkedinUrl">LinkedIn</Field.FieldLabel>
						<Input
							id="linkedinUrl"
							name="linkedinUrl"
							type="url"
							value={speaker?.linkedinUrl ?? ''}
						/>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="githubUrl">GitHub</Field.FieldLabel>
						<Input id="githubUrl" name="githubUrl" type="url" value={speaker?.githubUrl ?? ''} />
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
							<Field.FieldLabel for="name_{locale.code}">Name</Field.FieldLabel>
							<Input
								id="name_{locale.code}"
								name="name_{locale.code}"
								lang={locale.code}
								required={locale.required}
								value={t.name ?? ''}
							/>
						</Field.Field>

						<Field.Field>
							<Field.FieldLabel for="title_{locale.code}">Role or job title</Field.FieldLabel>
							<Input
								id="title_{locale.code}"
								name="title_{locale.code}"
								lang={locale.code}
								value={t.title ?? ''}
							/>
						</Field.Field>
					</div>

					<Field.Field>
						<Field.FieldLabel for="bio_{locale.code}">Bio</Field.FieldLabel>
						<Textarea
							id="bio_{locale.code}"
							name="bio_{locale.code}"
							lang={locale.code}
							rows={3}
							value={t.bio ?? ''}
						/>
					</Field.Field>
				</Field.FieldGroup>
			</Card.Content>
		</Card.Root>
	{/each}

	<div
		class="bg-background/85 sticky bottom-0 -mx-4 flex gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
	>
		<Button type="submit">{submitLabel}</Button>
		<Button href="/admin/speakers" variant="ghost">Cancel</Button>
	</div>
</div>
