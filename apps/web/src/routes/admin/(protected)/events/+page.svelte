<script lang="ts">
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Table from '$lib/components/ui/table';
	import { formatDate } from '$lib/format';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	function title(event: (typeof data.events)[number]): string {
		return event.translations.find((t) => t.locale === 'lo')?.title ?? event.slug;
	}
</script>

<Seo title="Events" noindex />

<PageHeader title="Events">
	{#snippet actions()}
		<Button href="/admin/events/new">
			<Plus data-icon="inline-start" />
			New event
		</Button>
	{/snippet}
</PageHeader>

<Card.Root class="mt-6 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Title</Table.Head>
					<Table.Head>Starts</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head class="text-right">Registered</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.events as event (event.id)}
					<Table.Row>
						<Table.Cell class="font-medium">
							<a href="/admin/events/{event.id}" class="hover:underline">{title(event)}</a>
							<span class="text-muted-foreground block text-xs">/{event.slug}</span>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground whitespace-nowrap">
							{formatDate(new Date(event.startAt))}
						</Table.Cell>
						<Table.Cell>
							<Badge variant={event.status === 'published' ? 'secondary' : 'outline'}>
								{event.status}
							</Badge>
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{event.registeredCount}{#if event.capacity > 0}<span class="text-muted-foreground"
									>/{event.capacity}</span
								>{/if}
						</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap">
							<Button href="/admin/events/{event.id}/registrations" variant="ghost" size="sm">
								Registrants
							</Button>
							<Button href="/admin/events/{event.id}" variant="ghost" size="sm">Edit</Button>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={5}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><CalendarDays /></Empty.Media>
									<Empty.Description>No events yet.</Empty.Description>
								</Empty.Header>
								<Empty.Content>
									<Button href="/admin/events/new" variant="outline" size="sm">
										<Plus data-icon="inline-start" />
										New event
									</Button>
								</Empty.Content>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Card.Root>
