<script lang="ts">
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import { formatDate } from '$lib/format';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import MessageSquare from '@lucide/svelte/icons/message-square';

	let { data } = $props();

	let eventTitle = $derived(
		data.event.translations.find((t) => t.locale === 'lo')?.title ?? data.event.slug
	);

	function stars(value: number | null): string {
		if (value === null) return '—';
		const filled = Math.round(value);
		return '★'.repeat(filled) + '☆'.repeat(Math.max(0, 5 - filled));
	}

	const summary = $derived([
		{ label: 'Overall', value: data.averages.overall },
		{ label: 'Venue', value: data.averages.venue },
		{ label: 'Content', value: data.averages.content }
	]);
</script>

<Seo title="Feedback" noindex />

<PageHeader title="Feedback" description={eventTitle}>
	{#snippet actions()}
		<Button href="/admin/events/{data.event.id}" variant="ghost" size="sm">
			<ArrowLeft data-icon="inline-start" />
			Back to event
		</Button>
	{/snippet}
</PageHeader>

<dl class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	{#each summary as item (item.label)}
		<Card.Root class="gap-1">
			<Card.Header><dt class="text-muted-foreground text-sm">{item.label}</dt></Card.Header>
			<Card.Content>
				<dd class="text-2xl font-bold tracking-tight tabular-nums">{item.value ?? '—'}</dd>
				<dd class="text-primary text-sm" aria-hidden="true">{stars(item.value)}</dd>
			</Card.Content>
		</Card.Root>
	{/each}

	<Card.Root class="gap-1">
		<Card.Header><dt class="text-muted-foreground text-sm">Responses</dt></Card.Header>
		<Card.Content>
			<dd class="text-2xl font-bold tracking-tight tabular-nums">{data.averages.responses}</dd>
			<dd class="text-muted-foreground text-xs">
				{data.averages.responseRate}% of registrations
			</dd>
		</Card.Content>
	</Card.Root>
</dl>

<div class="mt-8 flex flex-col gap-4">
	{#each data.entries as entry (entry.id)}
		<Card.Root class="[--card-spacing:--spacing(5)]">
			<Card.Header class="flex flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2">
				<div class="min-w-0">
					<Card.Title>{entry.attendeeName}</Card.Title>
					<Card.Description>{formatDate(new Date(entry.createdAt))}</Card.Description>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<span class="text-primary" aria-label="Overall {entry.overallRating} out of 5">
						{stars(entry.overallRating)}
					</span>
					{#if entry.allowPublic}
						<Badge variant="secondary">may quote</Badge>
					{:else}
						<Badge variant="outline">private</Badge>
					{/if}
				</div>
			</Card.Header>

			{#if entry.whatWentWell || entry.whatToImprove}
				<Card.Content class="grid gap-4 sm:grid-cols-2">
					{#if entry.whatWentWell}
						<div>
							<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
								What went well
							</p>
							<p class="mt-1.5 text-sm text-pretty">{entry.whatWentWell}</p>
						</div>
					{/if}

					{#if entry.whatToImprove}
						<div>
							<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
								To improve
							</p>
							<p class="mt-1.5 text-sm text-pretty">{entry.whatToImprove}</p>
						</div>
					{/if}
				</Card.Content>
			{/if}
		</Card.Root>
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><MessageSquare /></Empty.Media>
				<Empty.Description>
					No feedback yet. The form opens to ticket holders once the event has finished.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/each}
</div>
