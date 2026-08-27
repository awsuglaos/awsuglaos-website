<script lang="ts">
	import { enhance } from '$app/forms';
	import { AdminFormState, fieldValue, type AdminFormResult } from '$lib/admin-form.svelte';
	import AdminField from '$lib/components/admin/admin-field.svelte';
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import UnsavedGuard from '$lib/components/admin/unsaved-guard.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
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
			communityRole: 'none' | 'leader' | 'co_leader' | 'organiser';
			sortOrder: number;
			websiteUrl: string | null;
			linkedinUrl: string | null;
			githubUrl: string | null;
			translations: Translation[];
		};
		result?: AdminFormResult | null;
		action?: string;
		submitLabel?: string;
	}

	let { speaker, result = null, action, submitLabel = 'Save speaker' }: Props = $props();

	const formState = new AdminFormState();

	const v = (name: string, fallback: string | number | null | undefined) =>
		fieldValue(result, name, fallback);

	function tr(locale: 'lo' | 'en'): Partial<Translation> {
		return speaker?.translations.find((t) => t.locale === locale) ?? {};
	}

	const locales = [
		{ code: 'lo' as const, name: 'Lao', required: true },
		{ code: 'en' as const, name: 'English', required: false }
	];

	let communityRole = $derived(v('communityRole', speaker?.communityRole ?? 'none'));

	const links = [
		{ name: 'websiteUrl', label: 'Website' },
		{ name: 'linkedinUrl', label: 'LinkedIn' },
		{ name: 'githubUrl', label: 'GitHub' }
	] as const;
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
				<Card.Title>Profile</Card.Title>
			</Card.Header>

			<Card.Content>
				<Field.FieldGroup>
					<div class="grid gap-5 sm:grid-cols-2">
						<AdminField {result} name="slug" label="Slug" required>
							{#snippet input({ props })}
								<Input
									{...props}
									pattern="[a-z0-9]+(-[a-z0-9]+)*"
									placeholder="somchai-vongphachanh"
									value={v('slug', speaker?.slug)}
								/>
							{/snippet}
						</AdminField>

						<AdminField {result} name="company" label="Company">
							{#snippet input({ props })}
								<Input {...props} value={v('company', speaker?.company)} />
							{/snippet}
						</AdminField>

						<AdminField
							{result}
							name="communityRole"
							label="Community role"
							description="Whether they help run the group. Unrelated to the job title below. Drag to reorder on the team board."
						>
							{#snippet input({ props })}
								<!--
									Native <select>: this posts without JavaScript and matches the
									other status and role pickers in the backoffice, which the e2e
									suite drives with selectOption().
								-->
								<select {...props} class="native-select">
									<option value="none" selected={communityRole === 'none'}>Not on the team</option>
									<option value="leader" selected={communityRole === 'leader'}>Leader</option>
									<option value="co_leader" selected={communityRole === 'co_leader'}>
										Co-leader
									</option>
									<option value="organiser" selected={communityRole === 'organiser'}>
										Organiser
									</option>
								</select>
							{/snippet}
						</AdminField>

						<!--
							Carried through so saving a bio does not knock the person back to the
							top of their zone. Order itself is set on /admin/speakers/order.
						-->
						<input type="hidden" name="sortOrder" value={v('sortOrder', speaker?.sortOrder ?? 0)} />

						<Field.Field class="sm:col-span-2">
							<ImageField
								name="photoUrl"
								label="Photo"
								value={v('photoUrl', speaker?.photoUrl)}
								circular
								help="Square images look best — they are shown as a circle."
							/>
						</Field.Field>

						{#each links as link (link.name)}
							<AdminField {result} name={link.name} label={link.label}>
								{#snippet input({ props })}
									<Input {...props} type="url" value={v(link.name, speaker?.[link.name])} />
								{/snippet}
							</AdminField>
						{/each}
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
								name="name_{locale.code}"
								label="Name"
								required={locale.required}
							>
								{#snippet input({ props })}
									<Input {...props} lang={locale.code} value={v(`name_${locale.code}`, t.name)} />
								{/snippet}
							</AdminField>

							<AdminField {result} name="title_{locale.code}" label="Role or job title">
								{#snippet input({ props })}
									<Input {...props} lang={locale.code} value={v(`title_${locale.code}`, t.title)} />
								{/snippet}
							</AdminField>
						</div>

						<AdminField {result} name="bio_{locale.code}" label="Bio">
							{#snippet input({ props })}
								<Textarea
									{...props}
									lang={locale.code}
									rows={3}
									value={v(`bio_${locale.code}`, t.bio)}
								/>
							{/snippet}
						</AdminField>
					</Field.FieldGroup>
				</Card.Content>
			</Card.Root>
		{/each}

		<div
			class="bg-background/85 sticky bottom-0 -mx-4 flex items-center gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
		>
			<Button type="submit" disabled={formState.submitting}>
				{#if formState.submitting}<Spinner data-icon="inline-start" />{/if}
				{formState.submitting ? 'Saving…' : submitLabel}
			</Button>
			<Button href="/admin/speakers" variant="ghost">Cancel</Button>

			{#if formState.dirty && !formState.submitting}
				<span class="text-muted-foreground ml-auto text-xs">Unsaved changes</span>
			{/if}
		</div>
	</div>
</form>

<UnsavedGuard dirty={formState.dirty} />
