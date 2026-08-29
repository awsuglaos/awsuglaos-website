<script lang="ts">
	import BarList from '$lib/components/admin/bar-list.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import TrendChart from '$lib/components/admin/trend-chart.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
	import Download from '@lucide/svelte/icons/download';
	import { formatDate } from '$lib/format';
	import type { ChoiceTally } from '@awsug/core';

	let { data } = $props();

	let eventTitle = $derived(
		data.event.translations.find((t) => t.locale === 'lo')?.title ?? data.event.slug
	);

	/*
	 * A stat tile, not a chart: five single numbers have no shape to show, and
	 * drawing them as bars would be decoration standing in for information.
	 */
	let tiles = $derived([
		{ label: 'Registered', value: String(data.stats.registered) },
		{
			label: 'Capacity filled',
			value:
				data.capacity === 0
					? 'Unlimited'
					: `${Math.round((data.stats.registered / data.capacity) * 100)}%`
		},
		{ label: 'Checked in', value: String(data.stats.checkedIn) },
		{ label: 'Check-in rate', value: `${data.stats.checkInRate}%` },
		{
			label: 'Feedback',
			value: data.feedback.overall === null ? '—' : `${data.feedback.overall} / 5`
		}
	]);

	/*
	 * Dates are tallied as `YYYY-MM-DD` because that is what sorts; they are
	 * shown the way every other date on this site is. Pinned to +07:00 rather
	 * than parsed as local time, so the server rendering this and the browser
	 * hydrating it cannot disagree about which day it is.
	 */
	const asDay = (tally: ChoiceTally): ChoiceTally => {
		const day = new Date(`${tally.label}T00:00:00+07:00`);
		return Number.isNaN(day.getTime()) ? tally : { ...tally, label: formatDate(day) };
	};
</script>

<Seo title="Insights" noindex />

<PageHeader title="Insights" description={eventTitle}>
	{#snippet actions()}
		<Button variant="outline" size="sm" href="/admin/events/{data.event.id}/registrations/export">
			<Download data-icon="inline-start" />
			Export CSV
		</Button>
		<Button variant="outline" size="sm" href="/admin/events/{data.event.id}">
			<ArrowLeft data-icon="inline-start" />
			Back to event
		</Button>
	{/snippet}
</PageHeader>

<dl class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
	{#each tiles as tile (tile.label)}
		<div class="border-border bg-card rounded-xl border p-4">
			<dt class="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.14em] uppercase">
				{tile.label}
			</dt>
			<dd class="mt-1.5 text-2xl font-semibold tabular-nums">{tile.value}</dd>
		</div>
	{/each}
</dl>

{#if data.analytics.total === 0}
	<Empty.Root class="mt-8">
		<Empty.Header>
			<Empty.Media variant="icon"><ChartNoAxesColumn /></Empty.Media>
			<Empty.Title>Nobody has registered yet</Empty.Title>
			<Empty.Description>Answers and charts appear here as registrations arrive.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	{#if data.analytics.trend.length > 1}
		<Card.Root class="mt-8 [--card-spacing:--spacing(5)]">
			<Card.Header>
				<Card.Title class="text-base">Registrations per day</Card.Title>
				<Card.Description>Vientiane time, including the quiet days.</Card.Description>
			</Card.Header>
			<Card.Content>
				<TrendChart points={data.analytics.trend} caption="Registrations per day" />
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="mt-8 flex flex-col gap-6">
		{#each data.analytics.questions as question (question.id)}
			<Card.Root class="[--card-spacing:--spacing(5)]">
				<Card.Header>
					<Card.Title class="text-base">{question.label}</Card.Title>
					<Card.Description>
						{question.answered} of {data.analytics.total} answered · {question.responseRate}%
						{#if question.required}
							<Badge variant="outline" class="ml-1 text-[0.625rem]">Required</Badge>
						{/if}
					</Card.Description>
				</Card.Header>

				<Card.Content>
					{#if question.answered === 0}
						<p class="text-muted-foreground text-sm">No answers yet.</p>
					{:else if question.tallies.length > 0}
						<BarList
							rows={question.type === 'date' ? question.tallies.map(asDay) : question.tallies}
							caption={question.label}
						/>
					{:else if question.type === 'yesNo' || question.type === 'consent'}
						<!-- A consent box is still yes/no underneath, but "Yes / No" against
						     a sentence like "I accept the terms" reads as a poll result
						     rather than as who agreed. -->
						{@const [yesLabel, noLabel] =
							question.type === 'consent' ? ['Accepted', 'Declined'] : ['Yes', 'No']}
						<BarList
							caption={question.label}
							rows={[
								{
									label: yesLabel,
									count: question.yes,
									percent: Math.round((question.yes / question.answered) * 100)
								},
								{
									label: noLabel,
									count: question.no,
									percent: Math.round((question.no / question.answered) * 100)
								}
							]}
						/>
					{:else if question.distribution.length > 0}
						<p class="mb-4 text-sm">
							<span class="text-2xl font-semibold tabular-nums">{question.average}</span>
							<span class="text-muted-foreground">
								average · {question.median} median
							</span>
						</p>
						<BarList
							caption={question.label}
							rows={question.distribution.map((point) => ({
								label: String(point.value),
								count: point.count,
								percent: Math.round((point.count / question.answered) * 100)
							}))}
						/>
					{:else}
						<!--
							Answered, but nothing here adds up. A question retyped after the
							replies came in leaves the old answers behind in the old shape, and
							a blank card reads as a bug rather than as what it is.
						-->
						<p class="text-muted-foreground text-sm">
							{question.answered} answered, but nothing here can be charted — the stored answers are not
							the shape this question now asks for. They are all in the CSV export.
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{:else}
			<!--
				A form that only asks for a name, an address and a few written replies
				has nothing to chart, and the trend above is still worth showing.
				Saying where those answers actually are beats an empty column.
			-->
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon"><ChartNoAxesColumn /></Empty.Media>
					<Empty.Title>Nothing to chart</Empty.Title>
					<Empty.Description>
						This form only asks for written answers. Read them next to the person who wrote them.
					</Empty.Description>
				</Empty.Header>
				<Empty.Content>
					<Button href="/admin/events/{data.event.id}/registrations" variant="outline" size="sm">
						Open registrants
					</Button>
				</Empty.Content>
			</Empty.Root>
		{/each}

		{#if data.analytics.orphans.length > 0}
			<Card.Root class="[--card-spacing:--spacing(5)]">
				<Card.Header>
					<Card.Title class="text-base">Answers to removed questions</Card.Title>
					<Card.Description>
						These questions are no longer on the form, but people answered them while they were.
						Nothing has been deleted — the CSV export carries them in full.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<ul class="flex list-none flex-col gap-3 p-0">
						{#each data.analytics.orphans as orphan (orphan.id)}
							<li>
								<p class="font-mono text-xs">{orphan.id} · {orphan.count} answered</p>
								<p class="text-muted-foreground mt-1 text-sm">
									{orphan.samples.join(' · ')}
								</p>
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
{/if}
