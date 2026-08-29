<script lang="ts">
	import { goto } from '$app/navigation';
	import MapCanvas from '$lib/components/map/MapCanvas.svelte';
	import MapHud from '$lib/components/map/MapHud.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import { CITY_ORIGIN_LAT, CITY_ORIGIN_LNG, isInCity } from '$lib/map/projection.js';
	import NewsletterForm from '$lib/components/NewsletterForm.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Empty from '$lib/components/ui/empty';
	import { formatDateTime, isoDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import MapPin from '@lucide/svelte/icons/map-pin';

	let { data } = $props();

	let activeId = $state<string | null>(null);

	/*
	 * Past venues get a beacon too, dimmer and without the pulse. Three years of meetups
	 * scattered across the city is the most honest evidence the group is real — a claim the
	 * About paragraph can only assert, the map can show.
	 */
	let beacons = $derived(
		[
			...data.upcoming.map((event) => ({ event, past: false })),
			...data.past.map((event) => ({ event, past: true }))
		]
			.filter(({ event }) => event.locationLat !== null && event.locationLng !== null)
			.map(({ event, past }) => ({
				id: event.slug,
				lat: event.locationLat!,
				lng: event.locationLng!,
				past,
				label: event.locationName
			}))
			/*
			 * The scene drops anything outside the city box anyway. Dropping it here too is what
			 * keeps the HUD honest: it counts this list, so without the filter it reports nodes
			 * that are nowhere on the chart — which is precisely the case a reader would use the
			 * count to catch.
			 */
			.filter((beacon) => isInCity(beacon.lat, beacon.lng))
	);
</script>

<Seo title={m.events_title()} description={m.hero_subtitle()} />

<div class="mx-auto max-w-6xl px-4 py-14 sm:py-20">
	<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-6xl">{m.events_title()}</h1>
	<p class="text-muted-foreground mt-4 max-w-2xl text-lg text-pretty">{m.events_subtitle()}</p>

	<!--
		The same chart as the landing page, dropped to street level. Here it is a wayfinder
		rather than a statement, so every beacon has to be readable at once.
	-->
	<figure class="mt-10">
		<MapCanvas
			view="city"
			{beacons}
			{activeId}
			label={m.map_events_label()}
			class="border-border aspect-4/3 w-full rounded-xl border sm:aspect-16/10"
			onSelect={(slug) => goto(localizeHref(`/events/${slug}`))}
			onHover={(id) => (activeId = id)}
		>
			{#snippet hud()}
				<MapHud nodes={beacons.length} lat={CITY_ORIGIN_LAT} lng={CITY_ORIGIN_LNG} />
			{/snippet}
		</MapCanvas>

		<figcaption
			class="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
		>
			<span class="flex items-center gap-2">
				<span class="bg-primary size-2 rounded-full" aria-hidden="true"></span>
				{m.events_legend_upcoming()}
			</span>
			<span class="flex items-center gap-2">
				<span class="bg-primary/40 size-2 rounded-full" aria-hidden="true"></span>
				{m.events_legend_past()}
			</span>
			<span class="text-muted-foreground/70">{m.map_source()}</span>
		</figcaption>
	</figure>

	<!--
		Upcoming events as ruled rows rather than cards. There are rarely more than a handful
		and each carries the same four facts, so putting date, venue and availability in
		aligned columns lets them be compared down the page instead of read one box at a time.
	-->
	<section class="mt-16">
		<h2 class="text-xl font-semibold tracking-tight sm:text-2xl">{m.events_upcoming()}</h2>

		{#if data.upcoming.length > 0}
			<ul class="border-border mt-6 flex list-none flex-col divide-y border-y p-0">
				{#each data.upcoming as event (event.id)}
					<li
						class="group relative"
						onpointerenter={() => (activeId = event.slug)}
						onpointerleave={() => (activeId = null)}
					>
						<div
							class="grid gap-x-8 gap-y-3 py-6 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] sm:items-baseline"
						>
							<time
								datetime={isoDate(event.startAt)}
								class="text-muted-foreground font-mono text-xs tracking-[0.1em] uppercase tabular-nums"
							>
								{formatDateTime(event.startAt)}
							</time>

							<div class="min-w-0">
								<h3 class="text-lg font-semibold tracking-tight text-balance sm:text-xl">
									<a
										href={localizeHref(`/events/${event.slug}`)}
										onfocus={() => (activeId = event.slug)}
										onblur={() => (activeId = null)}
										class="group-hover:text-primary transition-colors after:absolute after:inset-0 after:content-['']"
									>
										{event.title}
									</a>
								</h3>
								<p class="text-muted-foreground mt-1.5 flex items-center gap-2 text-sm">
									<MapPin class="size-4 shrink-0" aria-hidden="true" />
									<span class="min-w-0">{event.locationName}</span>
								</p>
							</div>

							<div class="flex items-center gap-3 sm:justify-end">
								{#if event.registrationState === 'open'}
									<Badge variant="secondary">
										{event.seatsRemaining === null
											? m.event_seats_unlimited()
											: m.event_seats_remaining({ count: event.seatsRemaining })}
									</Badge>
								{:else if event.registrationState === 'full'}
									<Badge variant="destructive">{m.event_full()}</Badge>
								{:else}
									<Badge variant="outline">{m.event_closed()}</Badge>
								{/if}
								<ArrowRight
									class="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
									aria-hidden="true"
								/>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="mt-6 border">
				<Empty.Header>
					<Empty.Media variant="icon"><CalendarDays /></Empty.Media>
					<Empty.Description>{m.events_none_upcoming()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</section>

	{#if data.past.length > 0}
		<section class="mt-16">
			<h2 class="text-xl font-semibold tracking-tight sm:text-2xl">{m.events_past()}</h2>
			<ul
				class="mt-6 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-6 p-0"
			>
				{#each data.past as event (event.id)}
					<li
						class="min-w-0"
						onpointerenter={() => (activeId = event.slug)}
						onpointerleave={() => (activeId = null)}
					>
						<EventCard {event} highlighted={activeId === event.slug} />
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<div class="mt-20">
		<NewsletterForm />
	</div>
</div>
