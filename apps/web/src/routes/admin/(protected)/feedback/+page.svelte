<script lang="ts">
	import ConfirmSubmit from '$lib/components/admin/confirm-submit.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import { formatDateTime } from '$lib/format';
	import Archive from '@lucide/svelte/icons/archive';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data, form } = $props();

	const tabs = [
		{ status: 'pending', label: 'Pending' },
		{ status: 'approved', label: 'Published' },
		{ status: 'archived', label: 'Archived' }
	] as const;

	const emptyCopy: Record<string, string> = {
		pending: 'Nothing waiting. New feedback from the site lands here.',
		approved: 'Nothing published yet. Approving a message puts it on the feedback page.',
		archived: 'Nothing archived.'
	};
</script>

<Seo title="Feedback" noindex />

<PageHeader
	title="Feedback"
	description="Messages sent from the public site. Nothing is visible to visitors until it is published here."
/>

<FormAlert
	{form}
	successMessages={['Published to the site.', 'Archived.', 'Taken off the site.', 'Deleted.']}
/>

<!--
	Plain links rather than client-side tabs: the status is in the URL, so a
	reload keeps the queue an organiser was working through and the view can be
	bookmarked or shared.
-->
<nav class="mt-6 flex flex-wrap gap-2" aria-label="Filter by status">
	{#each tabs as tab (tab.status)}
		<Button
			href="/admin/feedback?status={tab.status}"
			variant={data.status === tab.status ? 'secondary' : 'outline'}
			size="sm"
			aria-current={data.status === tab.status ? 'page' : undefined}
		>
			{tab.label}
		</Button>
	{/each}
</nav>

{#if data.entries.length === 0}
	<Empty.Root class="mt-8">
		<Empty.Header>
			<Empty.Media variant="icon"><MessageSquare /></Empty.Media>
			<Empty.Title>Nothing here</Empty.Title>
			<Empty.Description>{emptyCopy[data.status]}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="mt-6 flex flex-col gap-4">
		{#each data.entries as entry (entry.id)}
			<Card.Root class="[--card-spacing:--spacing(5)]">
				<Card.Content class="flex flex-col gap-4">
					<div class="flex flex-wrap items-start gap-x-3 gap-y-1">
						<span class="font-medium">{entry.name ?? 'Anonymous'}</span>

						{#if entry.email}
							<!-- Present so an organiser can reply. Never published. -->
							<a
								href="mailto:{entry.email}"
								class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
							>
								{entry.email}
							</a>
						{/if}

						{#if entry.rating}
							<span class="text-primary text-sm" aria-label="{entry.rating} out of 5">
								<span aria-hidden="true">{'★'.repeat(entry.rating)}</span>
							</span>
						{/if}

						<Badge variant="outline" class="text-[0.625rem] uppercase">{entry.locale}</Badge>

						{#if entry.eventSlug}
							<Badge variant="secondary" class="text-[0.625rem]">{entry.eventSlug}</Badge>
						{/if}

						<span class="text-muted-foreground ml-auto text-xs whitespace-nowrap">
							{formatDateTime(new Date(entry.createdAt))}
						</span>
					</div>

					{#if entry.subject}
						<p class="font-medium">{entry.subject}</p>
					{/if}

					<p class="text-sm whitespace-pre-line">{entry.message}</p>

					<div class="flex flex-wrap items-center gap-2">
						{#if entry.status !== 'approved'}
							<form method="POST" action="?/approve">
								<input type="hidden" name="id" value={entry.id} />
								<Button type="submit" size="sm">
									<CircleCheck data-icon="inline-start" />
									Publish
								</Button>
							</form>
						{:else}
							<form method="POST" action="?/unpublish">
								<input type="hidden" name="id" value={entry.id} />
								<Button type="submit" size="sm" variant="outline">
									<EyeOff data-icon="inline-start" />
									Take off the site
								</Button>
							</form>
						{/if}

						{#if entry.status !== 'archived'}
							<form method="POST" action="?/archive">
								<input type="hidden" name="id" value={entry.id} />
								<Button type="submit" size="sm" variant="outline">
									<Archive data-icon="inline-start" />
									Archive
								</Button>
							</form>
						{/if}

						<ConfirmSubmit
							action="?/remove"
							class="ml-auto"
							title="Delete this message?"
							description="The message and the sender's address are removed for good. Archiving keeps it out of sight without destroying it."
							confirmLabel="Delete"
							triggerLabel="Delete message"
						>
							{#snippet trigger()}<Trash2 class="size-4" />{/snippet}
							<input type="hidden" name="id" value={entry.id} />
						</ConfirmSubmit>
					</div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
{/if}
