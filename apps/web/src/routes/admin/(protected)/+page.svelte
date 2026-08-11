<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import { Progress } from '$lib/components/ui/progress';
	import * as Table from '$lib/components/ui/table';
	import { formatDate } from '$lib/format';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';

	let { data } = $props();
	let t = $derived(data.dashboard.totals);

	const stats = $derived([
		{ label: 'Events', value: t.events, hint: `${t.publishedEvents} published` },
		{ label: 'Articles', value: t.articles, hint: `${t.publishedArticles} published` },
		{ label: 'Registrations', value: t.registrations, hint: `${t.checkedIn} checked in` },
		{ label: 'Subscribers', value: t.subscribers, hint: 'newsletter' }
	]);
</script>

<Seo title="Dashboard" noindex />

<h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>

<dl class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	{#each stats as stat (stat.label)}
		<Card.Root class="gap-1">
			<Card.Header>
				<dt class="text-muted-foreground text-sm">{stat.label}</dt>
			</Card.Header>
			<Card.Content>
				<dd class="text-3xl font-bold tracking-tight tabular-nums">{stat.value}</dd>
				<dd class="text-muted-foreground mt-0.5 text-xs">{stat.hint}</dd>
			</Card.Content>
		</Card.Root>
	{/each}
</dl>

<h2 class="mt-10 text-lg font-semibold tracking-tight">Registrations per event</h2>

<Card.Root class="mt-4 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Event</Table.Head>
					<Table.Head>Date</Table.Head>
					<Table.Head class="text-right">Registered</Table.Head>
					<Table.Head class="text-right">Checked in</Table.Head>
					<Table.Head class="w-44">Check-in rate</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.dashboard.events as event (event.id)}
					<Table.Row>
						<Table.Cell class="font-medium">{event.title}</Table.Cell>
						<Table.Cell class="text-muted-foreground whitespace-nowrap">
							{formatDate(new Date(event.startAt))}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{event.registered}{#if event.capacity > 0}<span class="text-muted-foreground"
									>/{event.capacity}</span
								>{/if}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{event.checkedIn}</Table.Cell>
						<Table.Cell>
							<!-- Bar plus number: the number is the fact, the bar is the shape. -->
							<div class="flex items-center gap-2">
								<Progress
									value={event.checkInRate}
									class="h-2 flex-1"
									aria-label="Check-in rate for {event.title}"
								/>
								<span class="text-muted-foreground w-9 text-right text-xs tabular-nums">
									{event.checkInRate}%
								</span>
							</div>
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button href="/admin/events/{event.id}/registrations" variant="ghost" size="sm">
								View
							</Button>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={6}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><CalendarDays /></Empty.Media>
									<Empty.Description>No events yet.</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Card.Root>
