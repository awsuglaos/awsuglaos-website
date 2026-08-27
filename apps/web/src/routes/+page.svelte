<script lang="ts">
	import { goto } from '$app/navigation';
	import ArticleCard from '$lib/components/ArticleCard.svelte';
	import BrandLogo from '$lib/components/brand-logo.svelte';
	import MapCanvas from '$lib/components/map/MapCanvas.svelte';
	import MapHud from '$lib/components/map/MapHud.svelte';
	import NewsletterForm from '$lib/components/NewsletterForm.svelte';
	import { HUB } from '$lib/map/places';
	import { SPONSOR_TILE } from '$lib/sponsor-tiles';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import { formatDateTime, isoDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { cn } from '$lib/utils';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import MapPin from '@lucide/svelte/icons/map-pin';

	let { data } = $props();

	const tiers = ['platinum', 'gold', 'silver', 'community'] as const;
	let sponsorsByTier = $derived(
		tiers
			.map((tier) => ({ tier, items: data.sponsors.filter((s) => s.tier === tier) }))
			.filter((group) => group.items.length > 0)
	);

	/*
	 * Only events the admin saved with a maps link carrying coordinates can be plotted. The
	 * rest still appear in the rail below — the map is a way in, never the only way in.
	 */
	let beacons = $derived(
		data.upcoming
			.filter((event) => event.locationLat !== null && event.locationLng !== null)
			.map((event) => ({
				id: event.slug,
				lat: event.locationLat!,
				lng: event.locationLng!,
				label: event.locationName
			}))
	);

	/** Shared between the rail and the model, so hovering either highlights the other. */
	let activeId = $state<string | null>(null);

	let lead = $derived(data.latest[0]);
	let rest = $derived(data.latest.slice(1));
</script>

<Seo title={m.site_name()} description={m.hero_subtitle()} />

<!--
	The first viewport is the country drawn as a live chart: real elevation contours, the
	national border, the group's venues pulsing on Vientiane, and arcs reaching out to the
	other cities. It reads flat until the pointer moves it, which is when the contour stack
	and the arcs give away that it was three-dimensional all along.
-->
<section class="relative isolate">
	<div class="pointer-events-none absolute inset-0 -z-10">
		<MapCanvas
			view="country"
			{beacons}
			{activeId}
			label={m.map_label()}
			class="pointer-events-auto h-full w-full"
			onSelect={(slug) => goto(localizeHref(`/events/${slug}`))}
			onHover={(id) => (activeId = id)}
		>
			{#snippet hud()}
				<MapHud nodes={beacons.length} lat={HUB.lat} lng={HUB.lng} peak={2409} />
			{/snippet}
		</MapCanvas>
	</div>

	<!--
		The overlay is transparent to the pointer so the model underneath stays clickable,
		and each block of real content switches events back on. Making the whole wrapper
		interactive would put an invisible sheet over the city; making it all inert would
		cost text selection on the headline.
	-->
	<div
		class="pointer-events-none mx-auto flex min-h-[min(88svh,54rem)] max-w-6xl flex-col px-4 pt-14 pb-10 sm:pt-20"
	>
		<div class="pointer-events-auto w-fit">
			<!--
				The group's own mark and full name, standing as a masthead above the headline.

				This is a brand lockup, not a kicker: it names who is speaking rather than
				priming what the headline says, and it is set at a size and weight that reads as
				identity instead of as a label hung over the title.
			-->
			<div class="flex items-center gap-3">
				<BrandLogo variant="mark" class="size-11 shrink-0 sm:size-12" eager />
				<span
					class="text-foreground/90 text-sm font-semibold tracking-tight text-balance sm:text-base"
				>
					{m.hero_brand()}
				</span>
			</div>

			<h1
				class="mt-7 max-w-3xl text-5xl font-bold tracking-tight text-balance sm:text-7xl lg:text-8xl"
			>
				{m.hero_title()}
			</h1>

			<!--
				A shorter measure than the headline's. Partly typographic — a long line under
				display type at this size reads as a wall — and partly compositional: it keeps
				the paragraph clear of the model's near corner without a scrim over it.
			-->
			<p class="text-muted-foreground mt-6 max-w-md text-lg text-pretty sm:text-xl">
				{m.hero_subtitle()}
			</p>

			<div class="mt-8 flex flex-wrap gap-3">
				<Button href={localizeHref('/events')} size="lg">
					{m.hero_cta_events()}
					<ArrowRight data-icon="inline-end" />
				</Button>
				<Button href={localizeHref('/news')} variant="outline" size="lg">
					{m.hero_cta_news()}
				</Button>
			</div>
		</div>
	</div>
</section>

<!--
	Next events, keyed to the beacons above. Hovering a card brightens its beacon; clicking a
	beacon comes here. Cards rather than rows because each one carries a cover image.

	The chart annotates itself now — the HUD carries the coordinates and the data source
	inside the frame, and the footer carries the licence attribution — so the separate label
	plate that used to sit here has gone.
-->
<section class="mx-auto max-w-6xl px-4 pt-14 pb-16">
	<div class="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
		<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.events_upcoming()}</h2>
		<a
			href={localizeHref('/events')}
			class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
		>
			{m.events_view_all()}
			<ArrowRight class="size-4" aria-hidden="true" />
		</a>
	</div>

	<!--
		`auto-fill`, not `auto-fit`. Fitting was tried and reverted: it collapses the empty
		tracks, so a single scheduled event stretches one card across the full container with
		a cover image about 750px tall. A card grid that keeps its track width and leaves a
		short last row is the correct behaviour; a lone card the width of the page is not.
	-->
	{#if data.upcoming.length > 0}
		<ul class="grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-6 p-0">
			{#each data.upcoming as event (event.id)}
				<li
					class="min-w-0"
					onpointerenter={() => (activeId = event.slug)}
					onpointerleave={() => (activeId = null)}
				>
					<Card.Root
						class="lift group relative h-full {activeId === event.slug
							? 'ring-primary/40 ring-2'
							: 'hover:ring-foreground/20'}"
					>
						{#if event.coverImageUrl}
							<img
								src={event.coverImageUrl}
								alt=""
								loading="lazy"
								decoding="async"
								class="aspect-1200/630 w-full object-cover"
							/>
						{/if}

						<Card.Header>
							<Card.Title class="text-lg tracking-tight">
								<a
									href={localizeHref(`/events/${event.slug}`)}
									onfocus={() => (activeId = event.slug)}
									onblur={() => (activeId = null)}
									class="group-hover:text-primary transition-colors after:absolute after:inset-0 after:content-['']"
								>
									{event.title}
								</a>
							</Card.Title>
						</Card.Header>

						<Card.Content>
							<dl class="text-muted-foreground grid gap-1.5 text-sm">
								<div class="flex items-start gap-2">
									<dt class="sr-only">{m.event_when()}</dt>
									<CalendarDays class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
									<dd class="min-w-0">
										<time datetime={isoDate(event.startAt)}>{formatDateTime(event.startAt)}</time>
									</dd>
								</div>
								<div class="flex items-start gap-2">
									<dt class="sr-only">{m.event_where()}</dt>
									<MapPin class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
									<dd class="min-w-0">{event.locationName}</dd>
								</div>
							</dl>
						</Card.Content>

						<Card.Footer class="mt-auto">
							{#if event.registrationState === 'open'}
								<Badge variant="secondary">
									{event.seatsRemaining === null
										? m.event_seats_unlimited()
										: m.event_seats_remaining({ count: event.seatsRemaining })}
								</Badge>
							{:else if event.registrationState === 'full'}
								<Badge variant="destructive">{m.event_full()}</Badge>
							{:else if event.registrationState === 'closed'}
								<Badge variant="outline">{m.event_closed()}</Badge>
							{/if}
						</Card.Footer>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><CalendarDays /></Empty.Media>
				<Empty.Description>{m.events_none_upcoming()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</section>

<!--
	The group's credentials as a spec plate, not a row of hero metrics: one ruled line in
	the model's own annotation register, read left to right like the legend on a drawing.
-->
<section class="mx-auto max-w-6xl px-4">
	<dl
		class="border-border flex flex-col gap-x-10 gap-y-4 border-y py-5 font-mono text-xs tracking-[0.14em] uppercase sm:flex-row sm:flex-wrap"
	>
		{#each [{ label: m.about_stat_events(), value: String(data.pastCount) }, { label: m.about_stat_members(), value: '200+' }, { label: m.about_stat_years(), value: '3' }] as stat (stat.label)}
			<div class="flex min-w-0 items-baseline gap-2">
				<dt class="text-muted-foreground">{stat.label}</dt>
				<dd class="text-foreground font-semibold tabular-nums">{stat.value}</dd>
			</div>
		{/each}
	</dl>
</section>

<!-- About -->
<section class="mx-auto max-w-6xl px-4 py-16 sm:py-20">
	<div class="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
		<h2 class="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{m.about_title()}</h2>
		<p class="max-w-[68ch] text-lg leading-relaxed text-pretty sm:text-xl">
			{m.about_body()}
		</p>
	</div>
</section>

<!--
	Latest news, led by one article at full width. A flat 3-up gives every story the same
	weight, which is a layout admitting it has no editor; leading with one says what to read
	first.
-->
{#if data.latest.length > 0}
	<section class="mx-auto max-w-6xl px-4 pb-16 sm:pb-20">
		<div class="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
			<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.news_title()}</h2>
			<a
				href={localizeHref('/news')}
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
			>
				{m.news_read_more()}
				<ArrowRight class="size-4" aria-hidden="true" />
			</a>
		</div>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
			<a
				href={localizeHref(`/news/${lead.slug}`)}
				class="group focus-visible:ring-ring block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
			>
				{#if lead.coverImageUrl}
					<img
						src={lead.coverImageUrl}
						alt=""
						loading="lazy"
						decoding="async"
						class="border-border aspect-1200/630 w-full rounded-xl border object-cover"
					/>
				{/if}
				<div class="mt-5">
					{#if lead.category}
						<Badge variant="secondary">{lead.category}</Badge>
					{/if}
					<h3
						class="group-hover:text-primary mt-3 text-2xl font-bold tracking-tight text-balance transition-colors sm:text-3xl"
					>
						{lead.title}
					</h3>
					{#if lead.excerpt}
						<p class="text-muted-foreground mt-3 max-w-[62ch] text-pretty">{lead.excerpt}</p>
					{/if}
				</div>
			</a>

			{#if rest.length > 0}
				<ul class="grid list-none content-start gap-6 p-0">
					{#each rest as article (article.id)}
						<li class="min-w-0"><ArticleCard {article} /></li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
{/if}

<!-- Sponsors -->
{#if sponsorsByTier.length > 0}
	<section class="mx-auto max-w-6xl px-4 pb-16 sm:pb-20">
		<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.sponsors_title()}</h2>
		<p class="text-muted-foreground mt-2 max-w-2xl text-pretty">{m.sponsors_body()}</p>

		<!--
			Tier label beside its logos rather than stacked above them. Most tiers hold one or
			two sponsors, so a heading per row turned four tiers into a column of mostly-empty
			bands.
		-->
		<div class="border-border mt-10 flex flex-col divide-y">
			{#each sponsorsByTier as group (group.tier)}
				<div
					data-sponsor-tier={group.tier}
					class="grid gap-x-6 gap-y-4 py-6 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] sm:items-center"
				>
					<h3 class="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
						{group.tier}
					</h3>
					<ul class="flex list-none flex-wrap items-center gap-3 p-0">
						{#each group.items as sponsor (sponsor.id)}
							{@const size = SPONSOR_TILE[group.tier]}
							<li
								class={cn(
									'border-border bg-card lift hover:border-foreground/20 flex items-center justify-center rounded-xl border',
									size.tile
								)}
							>
								{#if sponsor.websiteUrl}
									<a
										href={sponsor.websiteUrl}
										rel="noopener noreferrer sponsored"
										target="_blank"
										class="focus-visible:ring-ring flex items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
									>
										<img
											src={sponsor.logoUrl}
											alt={sponsor.name}
											loading="lazy"
											class={cn('w-auto object-contain', size.logo)}
										/>
									</a>
								{:else}
									<img
										src={sponsor.logoUrl}
										alt={sponsor.name}
										loading="lazy"
										class={cn('w-auto object-contain', size.logo)}
									/>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>
{/if}

<!--
	What people sent in, once an organiser approved it. The whole section is
	omitted when nothing is approved, so an empty moderation queue never leaves a
	hollow "testimonials" heading on the landing page.
-->
{#if data.feedback.length > 0}
	<section class="mx-auto max-w-6xl px-4 pb-16 sm:pb-20">
		<div class="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
			<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.feedback_wall_title()}</h2>
			<a
				href={localizeHref('/feedback')}
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
			>
				{m.feedback_wall_more()}
				<ArrowRight class="size-4" aria-hidden="true" />
			</a>
		</div>

		<ul class="grid list-none gap-4 p-0 sm:grid-cols-3">
			{#each data.feedback as entry (entry.id)}
				<li>
					<Card.Root class="h-full [--card-spacing:--spacing(5)]">
						<Card.Content class="flex h-full flex-col gap-3">
							{#if entry.rating}
								<p class="text-primary text-sm" aria-label="{entry.rating} out of 5">
									<span aria-hidden="true">{'★'.repeat(entry.rating)}</span>
									<span class="text-muted-foreground/40" aria-hidden="true">
										{'★'.repeat(5 - entry.rating)}
									</span>
								</p>
							{/if}

							<p class="flex-1 text-sm text-pretty">{entry.message}</p>

							<p class="text-muted-foreground text-xs">
								{entry.name ?? m.feedback_anonymous()}
							</p>
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="mx-auto max-w-6xl px-4 pb-4">
	<NewsletterForm />
</section>
