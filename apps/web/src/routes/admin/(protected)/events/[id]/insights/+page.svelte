<script lang="ts">
	import BarList from '$lib/components/admin/bar-list.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import TrendChart from '$lib/components/admin/trend-chart.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import { Input } from '$lib/components/ui/input';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
	import Download from '@lucide/svelte/icons/download';
	import Search from '@lucide/svelte/icons/search';

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

	/** One search box per text question, kept by question id. */
	let searches = $state<Record<string, string>>({});

	function matching(id: string, responses: string[]): string[] {
		const needle = (searches[id] ?? '').trim().toLocaleLowerCase();
		if (needle === '') return responses;
		return responses.filter((response) => response.toLocaleLowerCase().includes(needle));
	}

	const TEXT_TYPES = ['shortText', 'paragraph', 'email', 'phone', 'url', 'date'];
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
						<BarList rows={question.tallies} caption={question.label} />
					{:else if question.type === 'yesNo'}
						<BarList
							caption={question.label}
							rows={[
								{
									label: 'Yes',
									count: question.yes,
									percent: Math.round((question.yes / question.answered) * 100)
								},
								{
									label: 'No',
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
					{:else if TEXT_TYPES.includes(question.type)}
						{@const rows = matching(question.id, question.responses)}
						<!--
							Free text is not charted. There is nothing to aggregate, and a word
							cloud would turn what people actually wrote into decoration — so the
							answers are listed, with a filter for finding one.
						-->
						<div class="relative max-w-sm">
							<Search
								class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
								aria-hidden="true"
							/>
							<Input
								class="pl-9"
								placeholder="Search answers"
								aria-label="Search answers to {question.label}"
								value={searches[question.id] ?? ''}
								oninput={(e) => (searches[question.id] = e.currentTarget.value)}
							/>
						</div>

						<ul class="mt-4 flex list-none flex-col gap-2 p-0">
							{#each rows as response, index (index)}
								<li class="border-border rounded-lg border px-3 py-2 text-sm">{response}</li>
							{/each}
						</ul>

						{#if rows.length === 0}
							<p class="text-muted-foreground mt-4 text-sm">Nothing matches that search.</p>
						{/if}
					{/if}
				</Card.Content>
			</Card.Root>
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
