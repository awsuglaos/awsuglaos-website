<script lang="ts">
	import { enhance } from '$app/forms';
	import { AdminFormState, fieldValue } from '$lib/admin-form.svelte';
	import AdminField from '$lib/components/admin/admin-field.svelte';
	import ConfirmSubmit from '$lib/components/admin/confirm-submit.svelte';
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Table from '$lib/components/ui/table';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Handshake from '@lucide/svelte/icons/handshake';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data, form } = $props();
	let ok = $derived(form && 'message' in form && !('status' in form));

	const formState = new AdminFormState();

	/*
	 * The add form sits above the table it feeds, so a rejection keeps whatever
	 * was typed rather than clearing the row and asking for it all again.
	 */
	const v = (name: string, fallback: string | number = '') => fieldValue(form, name, fallback);

	let tierValue = $derived(v('tier', 'community'));
</script>

<Seo title="Sponsors" noindex />

<PageHeader title="Sponsors" />

{#if form?.message}
	<Alert variant={ok ? 'default' : 'destructive'} class="mt-4">
		{#if ok}<CircleCheck class="size-4" />{:else}<AlertCircle class="size-4" />{/if}
		<AlertDescription>{form.message}</AlertDescription>
	</Alert>
{/if}

<Card.Root class="mt-6 [--card-spacing:--spacing(5)]">
	<Card.Header>
		<Card.Title>Add a sponsor</Card.Title>
	</Card.Header>

	<Card.Content>
		<form
			method="POST"
			action="?/create"
			bind:this={formState.form}
			use:enhance={formState.enhance}
		>
			<Field.FieldGroup>
				<div class="grid gap-5 sm:grid-cols-2">
					<AdminField result={form} name="name" label="Name" required>
						{#snippet input({ props })}
							<Input {...props} value={v('name')} />
						{/snippet}
					</AdminField>

					<AdminField result={form} name="tier" label="Tier">
						{#snippet input({ props })}
							<!--
								Native <select>: this posts without JavaScript and matches the
								other status pickers in the backoffice, which the e2e suite
								drives with selectOption().
							-->
							<select {...props} class="native-select">
								<option value="platinum" selected={tierValue === 'platinum'}>Platinum</option>
								<option value="gold" selected={tierValue === 'gold'}>Gold</option>
								<option value="silver" selected={tierValue === 'silver'}>Silver</option>
								<option value="community" selected={tierValue === 'community'}>Community</option>
							</select>
						{/snippet}
					</AdminField>

					<Field.Field>
						<ImageField
							name="logoUrl"
							label="Logo"
							required
							value={v('logoUrl')}
							help="A transparent PNG reads best on both light and dark backgrounds."
						/>
					</Field.Field>

					<AdminField result={form} name="websiteUrl" label="Website">
						{#snippet input({ props })}
							<Input {...props} type="url" value={v('websiteUrl')} />
						{/snippet}
					</AdminField>

					<AdminField
						result={form}
						name="sortOrder"
						label="Sort order"
						description="Lower numbers appear first within a tier."
					>
						{#snippet input({ props })}
							<Input {...props} type="number" min="0" value={v('sortOrder', 0)} />
						{/snippet}
					</AdminField>
				</div>
			</Field.FieldGroup>

			<Button type="submit" class="mt-6" disabled={formState.submitting}>
				{#if formState.submitting}<Spinner data-icon="inline-start" />{/if}
				{formState.submitting ? 'Adding…' : 'Add sponsor'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root class="mt-8 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Logo</Table.Head>
					<Table.Head>Name</Table.Head>
					<Table.Head>Tier</Table.Head>
					<Table.Head class="text-right">Order</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.sponsors as sponsor (sponsor.id)}
					<Table.Row>
						<Table.Cell>
							<img
								src={sponsor.logoUrl}
								alt=""
								loading="lazy"
								class="h-8 w-auto max-w-32 object-contain"
							/>
						</Table.Cell>
						<Table.Cell class="font-medium">
							{sponsor.name}
							{#if sponsor.websiteUrl}
								<a
									href={sponsor.websiteUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="text-muted-foreground block max-w-56 truncate text-xs hover:underline"
								>
									{sponsor.websiteUrl}
								</a>
							{/if}
						</Table.Cell>
						<Table.Cell><Badge variant="secondary">{sponsor.tier}</Badge></Table.Cell>
						<Table.Cell class="text-right tabular-nums">{sponsor.sortOrder}</Table.Cell>
						<Table.Cell class="text-right">
							<ConfirmSubmit
								action="?/delete"
								title="Remove {sponsor.name}?"
								description="The sponsor is removed from the landing page and from every event it backs. This cannot be undone."
								confirmLabel="Remove sponsor"
								triggerLabel="Remove {sponsor.name}"
							>
								{#snippet trigger()}<Trash2 />{/snippet}
								<input type="hidden" name="id" value={sponsor.id} />
							</ConfirmSubmit>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={5}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><Handshake /></Empty.Media>
									<Empty.Description>No sponsors yet.</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Card.Root>
