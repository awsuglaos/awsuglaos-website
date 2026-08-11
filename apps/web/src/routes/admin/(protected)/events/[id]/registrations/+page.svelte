<script lang="ts">
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import { formatDateTime } from '$lib/format';
	import Download from '@lucide/svelte/icons/download';
	import Search from '@lucide/svelte/icons/search';
	import Users from '@lucide/svelte/icons/users';

	let { data } = $props();
	let query = $state('');

	let title = $derived(
		data.event.translations.find((t) => t.locale === 'lo')?.title ?? data.event.slug
	);

	// Client-side filter: the whole list is already loaded, and organisers need
	// to find one person quickly at the door.
	let filtered = $derived(
		query.trim() === ''
			? data.registrations
			: data.registrations.filter((r) => {
					const needle = query.trim().toLocaleLowerCase();
					return [r.fullName, r.email, r.ticketCode, r.organisation ?? ''].some((v) =>
						v.toLocaleLowerCase().includes(needle)
					);
				})
	);

	const stats = $derived([
		{ label: 'Registered', value: String(data.stats.registered) },
		{ label: 'Checked in', value: String(data.stats.checkedIn) },
		{ label: 'Check-in rate', value: `${data.stats.checkInRate}%` }
	]);
</script>

<Seo title="Registrants" noindex />

<PageHeader title="Registrants" description={title}>
	{#snippet actions()}
		<!--
			Stays an <a>, not a button: it is a link to a generated file, so it has
			to survive a middle-click and a right-click → Save as.
		-->
		<Button href="/admin/events/{data.event.id}/registrations/export" variant="outline">
			<Download data-icon="inline-start" />
			Export CSV
		</Button>
	{/snippet}
</PageHeader>

<dl class="mt-6 grid gap-4 sm:grid-cols-3">
	{#each stats as stat (stat.label)}
		<Card.Root class="gap-1">
			<Card.Header><dt class="text-muted-foreground text-sm">{stat.label}</dt></Card.Header>
			<Card.Content>
				<dd class="text-2xl font-bold tracking-tight tabular-nums">{stat.value}</dd>
			</Card.Content>
		</Card.Root>
	{/each}
</dl>

<div class="mt-8 max-w-md">
	<Label for="filter" class="sr-only">Search registrants</Label>
	<InputGroup.Root>
		<InputGroup.Addon><Search aria-hidden="true" /></InputGroup.Addon>
		<InputGroup.Input
			id="filter"
			type="search"
			bind:value={query}
			placeholder="Search name, email or ticket"
		/>
	</InputGroup.Root>
</div>

<Card.Root class="mt-4 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head>Phone</Table.Head>
					<Table.Head>Ticket</Table.Head>
					<Table.Head>Checked in</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each filtered as r (r.id)}
					<Table.Row>
						<Table.Cell class="font-medium">
							{r.fullName}
							{#if r.organisation}
								<span class="text-muted-foreground block text-xs">{r.organisation}</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{r.email}</Table.Cell>
						<Table.Cell class="text-muted-foreground whitespace-nowrap">
							{r.phone ?? '—'}
						</Table.Cell>
						<Table.Cell class="font-mono text-xs">{r.ticketCode}</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							{#if r.checkedInAt}
								<Badge variant="secondary">{formatDateTime(new Date(r.checkedInAt))}</Badge>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={5}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><Users /></Empty.Media>
									<Empty.Description>
										{data.registrations.length === 0
											? 'No registrations yet.'
											: 'No matches.'}
									</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Card.Root>
