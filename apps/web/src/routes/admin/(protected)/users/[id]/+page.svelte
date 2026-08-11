<script lang="ts">
	import DangerZone from '$lib/components/admin/danger-zone.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import ImageField from '$lib/components/admin/ImageField.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { formatDate } from '$lib/format';

	let { data, form } = $props();
</script>

<Seo title="Edit user" noindex />

<div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
	<div class="flex min-w-0 items-center gap-3">
		<Avatar.Root class="size-12 shrink-0">
			{#if data.user.avatarUrl}
				<Avatar.Image src={data.user.avatarUrl} alt="" />
			{/if}
			<Avatar.Fallback class="text-lg font-semibold">{data.user.name.slice(0, 1)}</Avatar.Fallback>
		</Avatar.Root>
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-bold tracking-tight">{data.user.name}</h1>
			<p class="text-muted-foreground truncate text-sm">{data.user.email}</p>
		</div>
	</div>

	<div class="flex shrink-0 items-center gap-2">
		{#if data.user.cognitoSub}
			<Badge variant="secondary">signed in</Badge>
		{:else}
			<Badge variant="outline">invited</Badge>
		{/if}
		<span class="text-muted-foreground text-xs whitespace-nowrap">
			added {formatDate(new Date(data.user.createdAt))}
		</span>
	</div>
</div>

<FormAlert {form} successMessages={['Saved.', 'Profile updated.', 'Role updated.']} />

<div class="mt-8 grid gap-6 lg:grid-cols-2">
	<Card.Root class="[--card-spacing:--spacing(5)]">
		<Card.Header>
			<Card.Title>Profile</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/profile">
				<Field.FieldGroup>
					<Field.Field>
						<Field.FieldLabel for="name">Name</Field.FieldLabel>
						<Input id="name" name="name" required value={data.user.name} />
					</Field.Field>

					<Field.Field>
						<ImageField
							name="avatarUrl"
							label="Photo"
							value={data.user.avatarUrl ?? ''}
							circular
							help="Square images look best — shown as a circle."
						/>
					</Field.Field>
				</Field.FieldGroup>

				<Button type="submit" class="mt-6">Save profile</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root class="[--card-spacing:--spacing(5)]">
		<Card.Header>
			<Card.Title>Role</Card.Title>
			<Card.Description>
				You cannot change your own role, and the last remaining admin cannot be demoted —
				otherwise nobody would be left who could grant the role back.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/role">
				<Field.FieldGroup>
					<Field.Field>
						<Field.FieldLabel for="role">Role</Field.FieldLabel>
						<select id="role" name="role" class="native-select">
							<option value="editor" selected={data.user.role === 'editor'}>
								Editor — news and speakers
							</option>
							<option value="admin" selected={data.user.role === 'admin'}>
								Admin — everything
							</option>
						</select>
					</Field.Field>
				</Field.FieldGroup>

				<Button type="submit" variant="outline" class="mt-6">Update role</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<DangerZone
	title="Remove user"
	description="Deletes their backoffice access and their Cognito identity. Content they authored is kept."
	confirmTitle="Remove {data.user.email}?"
	confirmDescription="They lose access immediately and their Cognito identity is deleted. Content they authored stays."
	confirmLabel="Remove user"
	triggerLabel="Remove"
/>
