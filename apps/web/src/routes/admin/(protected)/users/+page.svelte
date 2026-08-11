<script lang="ts">
	import ConfirmSubmit from '$lib/components/admin/confirm-submit.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import { formatDate } from '$lib/format';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';

	let { data, form } = $props();
	let ok = $derived(form && 'message' in form && !('status' in form));

	let adminCount = $derived(data.users.filter((u) => u.role === 'admin').length);
</script>

<Seo title="Users" noindex />

<PageHeader
	title="Users"
	description="Signing in is handled by Cognito; what someone may do is decided here. Removing a user revokes access immediately."
/>

{#if form?.message}
	<Alert variant={ok ? 'default' : 'destructive'} class="mt-4">
		{#if ok}<CircleCheck class="size-4" />{:else}<AlertCircle class="size-4" />{/if}
		<AlertDescription>{form.message}</AlertDescription>
	</Alert>
{/if}

<Card.Root class="mt-6 [--card-spacing:--spacing(5)]">
	<Card.Header>
		<Card.Title>Invite someone</Card.Title>
	</Card.Header>

	<Card.Content>
		<form method="POST" action="?/invite">
			<Field.FieldGroup>
				<div class="grid gap-5 sm:grid-cols-3">
					<Field.Field>
						<Field.FieldLabel for="name">Name</Field.FieldLabel>
						<Input id="name" name="name" required />
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="email">Email address</Field.FieldLabel>
						<Input id="email" name="email" type="email" required />
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="role">Role</Field.FieldLabel>
						<select id="role" name="role" class="native-select">
							<option value="editor" selected>Editor — news and speakers</option>
							<option value="admin">Admin — everything</option>
						</select>
					</Field.Field>
				</div>
			</Field.FieldGroup>

			<Button type="submit" class="mt-6">
				<UserPlus data-icon="inline-start" />
				Send invitation
			</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root class="mt-8 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-14"></Table.Head>
					<Table.Head>Name</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head>Signed in</Table.Head>
					<Table.Head>Added</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as user (user.id)}
					{@const lastAdmin = user.role === 'admin' && adminCount === 1}
					<Table.Row>
						<Table.Cell>
							<Avatar.Root class="size-9">
								{#if user.avatarUrl}
									<Avatar.Image src={user.avatarUrl} alt="" />
								{/if}
								<Avatar.Fallback class="font-semibold">{user.name.slice(0, 1)}</Avatar.Fallback>
							</Avatar.Root>
						</Table.Cell>
						<Table.Cell class="font-medium">
							<a href="/admin/users/{user.id}" class="hover:underline">{user.name}</a>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{user.email}</Table.Cell>
						<Table.Cell>
							<form method="POST" action="?/role" class="flex items-center gap-2">
								<input type="hidden" name="id" value={user.id} />
								<select
									name="role"
									class="native-select h-7 w-auto text-xs"
									disabled={lastAdmin}
									aria-label="Role for {user.email}"
								>
									<option value="editor" selected={user.role === 'editor'}>editor</option>
									<option value="admin" selected={user.role === 'admin'}>admin</option>
								</select>
								{#if !lastAdmin}
									<Button type="submit" variant="ghost" size="sm">Update</Button>
								{/if}
							</form>
							{#if lastAdmin}
								<span class="text-muted-foreground text-xs">last admin — cannot be changed</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if user.cognitoSub}
								<Badge variant="secondary">yes</Badge>
							{:else}
								<Badge variant="outline">invited</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground whitespace-nowrap">
							{formatDate(new Date(user.createdAt))}
						</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap">
							<Button href="/admin/users/{user.id}" variant="ghost" size="sm">Edit</Button>
							{#if !lastAdmin}
								<ConfirmSubmit
									action="?/remove"
									title="Remove {user.email}?"
									description="They lose access to the backoffice immediately. Anything they published stays."
									confirmLabel="Remove user"
									triggerLabel="Remove {user.email}"
								>
									{#snippet trigger()}<Trash2 />{/snippet}
									<input type="hidden" name="id" value={user.id} />
								</ConfirmSubmit>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Card.Root>
