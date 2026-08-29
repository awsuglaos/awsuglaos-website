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
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleSlash from '@lucide/svelte/icons/circle-slash';
	import Download from '@lucide/svelte/icons/download';
	import Search from '@lucide/svelte/icons/search';
	import Users from '@lucide/svelte/icons/users';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form } = $props();
	let query = $state('');

	/*
	 * Selection is keyed by id rather than by row index: the list re-renders on
	 * every search keystroke and after every decision, and an index-based set
	 * would silently start pointing at different people.
	 */
	const selected = new SvelteSet<string>();

	const FILTERS = [
		{ label: 'All', value: undefined },
		{ label: 'Pending', value: 'pending' as const },
		{ label: 'Approved', value: 'approved' as const },
		{ label: 'Rejected', value: 'rejected' as const }
	];

	const STATUS_BADGE = {
		pending: { label: 'Pending', variant: 'outline' as const },
		approved: { label: 'Approved', variant: 'secondary' as const },
		rejected: { label: 'Rejected', variant: 'destructive' as const }
	};

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
					// Name and email are only present when the event's form asks for
					// them, so every haystack strand has to survive being null.
					return [r.fullName, r.email, r.ticketCode, r.organisation].some((v) =>
						(v ?? '').toLocaleLowerCase().includes(needle)
					);
				})
	);

	// Only the rows on screen can be acted on, so "select all" cannot quietly
	// approve somebody the search has filtered out of view.
	const visibleIds = $derived(new Set(filtered.map((r) => r.id)));
	const chosen = $derived(filtered.filter((r) => selected.has(r.id)));
	const allVisibleChosen = $derived(filtered.length > 0 && chosen.length === filtered.length);

	$effect(() => {
		// Drop anything that has scrolled out of the current filter, so the
		// selection can never carry a stale id into a decision.
		for (const id of selected) if (!visibleIds.has(id)) selected.delete(id);
	});

	function toggleAll() {
		if (allVisibleChosen) selected.clear();
		else for (const r of filtered) selected.add(r.id);
	}

	const stats = $derived([
		{ label: 'Approved', value: String(data.stats.registered) },
		...(data.event.requiresApproval
			? [{ label: 'Pending', value: String(data.stats.pending) }]
			: []),
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

<FormAlert {form} />

<dl class="mt-6 grid gap-4 {data.event.requiresApproval ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}">
	{#each stats as stat (stat.label)}
		<Card.Root class="gap-1">
			<Card.Header><dt class="text-muted-foreground text-sm">{stat.label}</dt></Card.Header>
			<Card.Content>
				<dd class="text-2xl font-bold tracking-tight tabular-nums">{stat.value}</dd>
			</Card.Content>
		</Card.Root>
	{/each}
</dl>

{#if data.event.requiresApproval}
	<!--
		Links, not buttons: the filter is a URL, so a half-worked-through queue
		survives a reload and can be handed to someone else.
	-->
	<nav class="mt-8 flex flex-wrap gap-2" aria-label="Filter by status">
		{#each FILTERS as f (f.label)}
			<Button
				href="?{f.value ? `status=${f.value}` : ''}"
				variant={data.status === f.value ? 'default' : 'outline'}
				size="sm"
			>
				{f.label}
				{#if f.value === 'pending' && data.stats.pending > 0}
					<span class="ml-1.5 tabular-nums">{data.stats.pending}</span>
				{/if}
			</Button>
		{/each}
	</nav>
{/if}

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

{#if data.event.requiresApproval && chosen.length > 0}
	<!--
		Two forms rather than one with two submit buttons: rejecting carries a
		note that approving must not pick up, and a shared form would post the
		note either way.
	-->
	<Card.Root class="mt-4">
		<Card.Content class="flex flex-wrap items-end gap-4">
			<p class="text-sm font-medium">
				{chosen.length}
				selected
			</p>

			<form method="POST" action="?/approve" class="contents">
				{#each chosen as r (r.id)}
					<input type="hidden" name="id" value={r.id} />
				{/each}
				<Button type="submit" size="sm">
					<CircleCheck data-icon="inline-start" />
					Approve selected
				</Button>
			</form>

			<form method="POST" action="?/reject" class="flex flex-1 flex-wrap items-end gap-3">
				{#each chosen as r (r.id)}
					<input type="hidden" name="id" value={r.id} />
				{/each}
				<div class="min-w-56 flex-1">
					<Label for="note" class="text-muted-foreground text-xs">
						Reason (optional — included in the email)
					</Label>
					<InputGroup.Root class="mt-1">
						<InputGroup.Input
							id="note"
							name="note"
							maxlength={500}
							placeholder="We were oversubscribed this time"
						/>
					</InputGroup.Root>
				</div>
				<Button type="submit" size="sm" variant="outline">
					<CircleSlash data-icon="inline-start" />
					Reject selected
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root class="mt-4 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					{#if data.event.requiresApproval}
						<Table.Head class="w-10">
							<Checkbox
								checked={allVisibleChosen}
								onCheckedChange={toggleAll}
								aria-label="Select all shown"
							/>
						</Table.Head>
					{/if}
					<Table.Head>Name</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head>Phone</Table.Head>
					<Table.Head>Ticket</Table.Head>
					{#if data.event.requiresApproval}
						<Table.Head>Status</Table.Head>
					{/if}
					<Table.Head>Checked in</Table.Head>
					{#if data.event.requiresApproval}
						<Table.Head class="text-right">Decision</Table.Head>
					{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each filtered as r (r.id)}
					<Table.Row>
						{#if data.event.requiresApproval}
							<Table.Cell>
								<Checkbox
									checked={selected.has(r.id)}
									onCheckedChange={(v) => (v ? selected.add(r.id) : selected.delete(r.id))}
									aria-label="Select {r.fullName ?? r.ticketCode}"
								/>
							</Table.Cell>
						{/if}
						<Table.Cell class="font-medium">
							{r.fullName ?? '—'}
							{#if r.organisation}
								<span class="text-muted-foreground block text-xs">{r.organisation}</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{r.email ?? '—'}</Table.Cell>
						<Table.Cell class="text-muted-foreground whitespace-nowrap">
							{r.phone ?? '—'}
						</Table.Cell>
						<Table.Cell class="font-mono text-xs">{r.ticketCode}</Table.Cell>
						{#if data.event.requiresApproval}
							<Table.Cell class="whitespace-nowrap">
								<Badge variant={STATUS_BADGE[r.status].variant}>
									{STATUS_BADGE[r.status].label}
								</Badge>
								{#if r.reviewNote}
									<span class="text-muted-foreground mt-1 block max-w-56 text-xs text-pretty">
										{r.reviewNote}
									</span>
								{/if}
							</Table.Cell>
						{/if}
						<Table.Cell class="whitespace-nowrap">
							{#if r.checkedInAt}
								<Badge variant="secondary">{formatDateTime(new Date(r.checkedInAt))}</Badge>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						{#if data.event.requiresApproval}
							<Table.Cell class="text-right whitespace-nowrap">
								<!--
									Plain posts with the row's own id, so a single decision works
									with no JavaScript and takes the identical path as the bulk bar.
								-->
								<div class="flex justify-end gap-1">
									{#if r.status !== 'approved'}
										<form method="POST" action="?/approve">
											<input type="hidden" name="id" value={r.id} />
											<Button type="submit" size="sm" variant="ghost" title="Approve">
												<CircleCheck data-icon="inline-start" />
												Approve
											</Button>
										</form>
									{/if}
									{#if r.status !== 'rejected'}
										<form method="POST" action="?/reject">
											<input type="hidden" name="id" value={r.id} />
											<Button type="submit" size="sm" variant="ghost" title="Reject">
												<CircleSlash data-icon="inline-start" />
												Reject
											</Button>
										</form>
									{/if}
								</div>
							</Table.Cell>
						{/if}
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={data.event.requiresApproval ? 8 : 5}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><Users /></Empty.Media>
									<Empty.Description>
										{data.registrations.length === 0 ? 'No registrations yet.' : 'No matches.'}
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
