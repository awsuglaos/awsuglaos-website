<script lang="ts">
	import { enhance } from '$app/forms';
	import { isInCity } from '$lib/map/projection.js';
	import MapCanvas from '$lib/components/map/MapCanvas.svelte';
	import RegistrationForm from '$lib/components/RegistrationForm.svelte';
	import PhotoLightbox from '$lib/components/PhotoLightbox.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatEventRange, isoDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { SPONSOR_TILE } from '$lib/sponsor-tiles';
	import { cn } from '$lib/utils';
	import { richTextToPlainText } from '@awsug/shared';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Download from '@lucide/svelte/icons/download';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import CodeXml from '@lucide/svelte/icons/code-xml';
	import FileText from '@lucide/svelte/icons/file-text';
	import Presentation from '@lucide/svelte/icons/presentation';
	import Video from '@lucide/svelte/icons/video';

	let { data, form } = $props();
	let submitting = $state(false);

	let event = $derived(data.event);
	let canRegister = $derived(event.registrationState === 'open');
	let descriptionText = $derived(richTextToPlainText(event.description));

	/*
	 * Materials arrive empty until the event has ended — the gate lives in
	 * getPublishedEventBySlug, not here, so this template cannot leak them early
	 * by forgetting a condition. It only has to decide whether to draw a heading.
	 */
	const kindIcons = {
		slides: Presentation,
		code: CodeXml,
		video: Video,
		document: FileText,
		other: ExternalLink
	};

	const kindLabels = {
		slides: m.event_resource_kind_slides,
		code: m.event_resource_kind_code,
		video: m.event_resource_kind_video,
		document: m.event_resource_kind_document,
		other: m.event_resource_kind_other
	};

	/** An upload is site-relative; anything else points somewhere we do not own. */
	const isUpload = (url: string) => url.startsWith('/uploads/');

	function fileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	/** "github.com" out of a URL, so a link says where it is going. */
	function hostOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	}

	/*
	 * The 3D locator only knows central Vientiane. An event anywhere else — a provincial
	 * meetup, a venue saved from a bare place name — falls back to the Google embed, which
	 * covers the whole country. Showing a plate the venue is not on would be worse than
	 * showing no plate at all.
	 */
	let modelledVenue = $derived(
		event.locationLat !== null &&
			event.locationLng !== null &&
			isInCity(event.locationLat, event.locationLng)
			? { lat: event.locationLat, lng: event.locationLng }
			: null
	);

	const tierOrder = ['platinum', 'gold', 'silver', 'community'] as const;
	let sponsorsByTier = $derived(
		tierOrder
			.map((tier) => ({ tier, items: data.sponsors.filter((s) => s.tier === tier) }))
			.filter((group) => group.items.length > 0)
	);

	/*
	 * Structured data helps the event surface in search results with its date and
	 * location attached.
	 *
	 * Every "<" is rewritten to its < escape before the JSON is inlined.
	 * JSON.stringify leaves "<" alone, so an event description containing a
	 * literal closing script tag would otherwise end this element early and let
	 * the rest of the description run as markup — the classic JSON-in-script
	 * breakout. The escape keeps the JSON valid while making that impossible,
	 * which is what makes the raw-HTML expression below safe.
	 */
	let jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'Event',
			name: event.title,
			startDate: isoDate(event.startAt),
			endDate: isoDate(event.endAt),
			eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
			eventStatus: 'https://schema.org/EventScheduled',
			location: {
				'@type': 'Place',
				name: event.locationName,
				...(event.locationUrl ? { hasMap: event.locationUrl } : {}),
				// Coordinates were parsed out of the maps link when the event was
				// saved, so search engines get a precise venue rather than a string.
				...(event.locationLat !== null && event.locationLng !== null
					? {
							geo: {
								'@type': 'GeoCoordinates',
								latitude: event.locationLat,
								longitude: event.locationLng
							}
						}
					: {})
			},
			description: descriptionText.slice(0, 300),
			...(event.coverImageUrl ? { image: [event.coverImageUrl] } : {}),
			organizer: { '@type': 'Organization', name: 'AWS User Group Lao' },
			...(data.speakers.length > 0
				? {
						performer: data.speakers.map((s) => ({
							'@type': 'Person',
							name: s.name,
							...(s.company ? { worksFor: { '@type': 'Organization', name: s.company } } : {})
						}))
					}
				: {}),
			...(data.sponsors.length > 0
				? {
						sponsor: data.sponsors.map((s) => ({
							'@type': 'Organization',
							name: s.name,
							...(s.websiteUrl ? { url: s.websiteUrl } : {})
						}))
					}
				: {})
		}).replace(/</g, '\\u003c')
	);
</script>

<Seo
	title={event.title}
	description={descriptionText.slice(0, 160)}
	image={event.coverImageUrl}
	type="article"
/>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- jsonLd is JSON.stringify output with `<` escaped; see the comment above it -->
	{@html '<script type="application/ld+json">' + jsonLd + '</scr' + 'ipt>'}
</svelte:head>

<article class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<a
		href={localizeHref('/events')}
		class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
	>
		<ArrowLeft class="size-4" aria-hidden="true" />
		{m.event_back()}
	</a>

	{#if event.translationFallback}
		<Alert class="mt-6">
			<AlertDescription>{m.translation_fallback()}</AlertDescription>
		</Alert>
	{/if}

	{#if event.coverImageUrl}
		<img
			src={event.coverImageUrl}
			alt=""
			class="border-border mt-8 aspect-1200/630 w-full rounded-xl border object-cover"
		/>
	{/if}

	<header class="mt-10">
		<h1 class="max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
			{event.title}
		</h1>
	</header>

	<Separator class="mt-10" />

	<!--
		Two columns from `lg` up. The facts panel is placed into the right-hand track by grid
		position rather than by source order, so on a phone the reader still gets when, where
		and whether there are seats *before* the description — which is the order those three
		questions actually arrive in.
	-->
	<div class="mt-10 grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
		<aside class="lg:col-start-2 lg:row-start-1">
			<div class="lg:sticky lg:top-24">
				<dl class="border-border flex flex-col gap-5 border-y py-6">
					<div class="flex items-start gap-3">
						<span
							class="bg-muted text-foreground mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg"
						>
							<CalendarDays class="size-4" aria-hidden="true" />
						</span>
						<div class="min-w-0">
							<dt
								class="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
							>
								{m.event_when()}
							</dt>
							<dd class="mt-1 text-sm font-medium">
								<time datetime={isoDate(event.startAt)}>
									{formatEventRange(event.startAt, event.endAt)}
								</time>
							</dd>
						</div>
					</div>

					<div class="flex items-start gap-3">
						<span
							class="bg-muted text-foreground mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg"
						>
							<MapPin class="size-4" aria-hidden="true" />
						</span>
						<div class="min-w-0">
							<dt
								class="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
							>
								{m.event_where()}
							</dt>
							<dd class="mt-1 text-sm font-medium">
								{event.locationName}
								{#if event.locationUrl}
									<a
										href={event.locationUrl}
										rel="noopener noreferrer"
										target="_blank"
										class="text-primary ml-1 font-normal underline underline-offset-4"
									>
										{m.event_view_map()}
									</a>
								{/if}
							</dd>
						</div>
					</div>
				</dl>

				<div class="mt-6 flex flex-wrap items-center gap-3">
					{#if event.registrationState === 'open'}
						<Badge variant="secondary">
							{event.seatsRemaining === null
								? m.event_seats_unlimited()
								: m.event_seats_remaining({ count: event.seatsRemaining })}
						</Badge>
						<Button href="#register" size="sm">{m.event_register()}</Button>
					{:else if event.registrationState === 'full'}
						<Badge variant="destructive">{m.event_full()}</Badge>
					{:else}
						<Badge variant="outline">{m.event_closed()}</Badge>
					{/if}
				</div>
			</div>
		</aside>

		<div class="min-w-0 lg:col-start-1 lg:row-start-1">
			<!-- Sanitised in packages/core/src/content/render.ts before it reaches here. -->
			<div class="prose prose-neutral dark:prose-invert max-w-[68ch]">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised server-side, see above -->
				{@html event.descriptionHtml}
			</div>

			<!--
		Venue. The model shows where the venue sits in the city — which block, which side of
		the river — and the maps link still carries turn-by-turn directions, because a
		beautiful locator that cannot route you there has taken something away.
	-->
			{#if modelledVenue || event.mapEmbedUrl}
				<section class="mt-14">
					<h2 class="text-xl font-semibold tracking-tight">{m.event_where()}</h2>

					{#if modelledVenue}
						<MapCanvas
							view="venue"
							beacons={[
								{
									id: event.slug,
									lat: modelledVenue.lat,
									lng: modelledVenue.lng,
									label: event.locationName
								}
							]}
							focus={modelledVenue}
							label={m.map_venue_label({ venue: event.locationName })}
							class="border-border mt-4 aspect-16/10 w-full rounded-xl border sm:aspect-2/1"
						/>
					{:else if event.mapEmbedUrl}
						<div class="border-border mt-4 overflow-hidden rounded-xl border">
							<iframe
								src={event.mapEmbedUrl}
								title="{m.event_where()}: {event.locationName}"
								class="block h-72 w-full border-0"
								loading="lazy"
								referrerpolicy="no-referrer-when-downgrade"
								allowfullscreen
							></iframe>
						</div>
					{/if}

					<p class="text-muted-foreground mt-3 text-sm">
						{event.locationName}
						<a
							href={event.locationUrl}
							rel="noopener noreferrer"
							target="_blank"
							class="text-primary ml-1 underline underline-offset-4">{m.event_view_map()}</a
						>
					</p>
					{#if modelledVenue}
						<p
							class="text-muted-foreground/70 mt-2 font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
						>
							{m.map_source()}
						</p>
					{/if}
				</section>
			{/if}

			<!-- Speakers -->
			{#if data.speakers.length > 0}
				<section class="mt-14">
					<h2 class="text-xl font-semibold tracking-tight">{m.event_speakers()}</h2>
					<ul class="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2">
						{#each data.speakers as speaker (speaker.id)}
							<li>
								<Card.Root class="h-full">
									<Card.Header class="flex flex-row items-start gap-4">
										<Avatar.Root class="size-14 shrink-0">
											<!--
										Only mounted when there is a photo: bits-ui treats a
										missing `src` as an image still loading, which leaves
										the fallback initial hidden behind an empty circle.
									-->
											{#if speaker.photoUrl}
												<Avatar.Image src={speaker.photoUrl} alt="" />
											{/if}
											<Avatar.Fallback class="text-base font-semibold">
												{speaker.name.slice(0, 1)}
											</Avatar.Fallback>
										</Avatar.Root>

										<div class="min-w-0 flex-1">
											<Card.Title>{speaker.name}</Card.Title>
											{#if speaker.title || speaker.company}
												<Card.Description class="mt-0.5">
													{[speaker.title, speaker.company].filter(Boolean).join(' · ')}
												</Card.Description>
											{/if}
										</div>
									</Card.Header>

									<Card.Content class="flex flex-col gap-2">
										{#if speaker.talkTitle}
											<p class="text-primary text-sm font-medium">{speaker.talkTitle}</p>
										{/if}
										{#if speaker.abstract}
											<p class="text-muted-foreground text-sm">{speaker.abstract}</p>
										{:else if speaker.bio}
											<p class="text-muted-foreground text-sm">{speaker.bio}</p>
										{/if}

										{#if speaker.websiteUrl || speaker.linkedinUrl || speaker.githubUrl}
											<p class="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
												{#each [{ href: speaker.websiteUrl, label: 'Website' }, { href: speaker.linkedinUrl, label: 'LinkedIn' }, { href: speaker.githubUrl, label: 'GitHub' }] as link (link.label)}
													{#if link.href}
														<a
															href={link.href}
															target="_blank"
															rel="noopener noreferrer"
															aria-label="{speaker.name} on {link.label}"
															class="hover:text-foreground underline underline-offset-4"
														>
															{link.label}
														</a>
													{/if}
												{/each}
											</p>
										{/if}
									</Card.Content>
								</Card.Root>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Sponsors of this event, at this event's tiers -->
			{#if sponsorsByTier.length > 0}
				<section class="mt-14">
					<h2 class="text-xl font-semibold tracking-tight">{m.event_sponsors()}</h2>
					<!-- Same tier-beside-logos rhythm as the landing page's sponsor block. -->
					<div class="border-border mt-6 flex flex-col divide-y">
						{#each sponsorsByTier as group (group.tier)}
							<div
								data-sponsor-tier={group.tier}
								class="grid gap-x-6 gap-y-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] sm:items-center"
							>
								<h3 class="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
									{group.tier}
								</h3>
								<ul class="flex list-none flex-wrap items-center gap-3 p-0">
									{#each group.items as sponsor (sponsor.sponsorId)}
										{@const size = SPONSOR_TILE[group.tier]}
										<li
											class={cn(
												'border-border bg-card lift flex items-center justify-center rounded-xl border',
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

			<!-- Resources: only ever non-empty once the event has ended -->
			{#if event.resources.length > 0}
				<section class="mt-14">
					<h2 class="text-xl font-semibold tracking-tight">{m.event_resources()}</h2>
					<p class="text-muted-foreground mt-1 text-sm">{m.event_resources_intro()}</p>

					<ul class="border-border mt-6 flex list-none flex-col divide-y p-0">
						{#each event.resources as resource (resource.id)}
							{@const Icon = kindIcons[resource.kind]}
							<li>
								<a
									href={resource.url}
									class="hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-4 rounded-lg px-2 py-4 outline-none focus-visible:ring-2"
									{...isUpload(resource.url)
										? { download: '' }
										: { target: '_blank', rel: 'noopener noreferrer' }}
								>
									<span
										class="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-lg"
									>
										<Icon class="size-5" />
									</span>

									<span class="min-w-0 flex-1">
										<span class="block truncate font-medium">{resource.title}</span>
										<span class="text-muted-foreground block text-xs">
											{kindLabels[resource.kind]()}
											{#if resource.sizeBytes}· {fileSize(resource.sizeBytes)}{/if}
											{#if !isUpload(resource.url) && hostOf(resource.url)}· {hostOf(
													resource.url
												)}{/if}
										</span>
									</span>

									<span class="text-muted-foreground shrink-0">
										{#if isUpload(resource.url)}
											<Download class="size-4" />
											<span class="sr-only">{m.event_resource_download()}</span>
										{:else}
											<ExternalLink class="size-4" />
											<span class="sr-only">{m.event_resource_open()}</span>
										{/if}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Photos from the day -->
			{#if event.photos.length > 0}
				<section class="mt-14">
					<h2 class="text-xl font-semibold tracking-tight">{m.event_photos()}</h2>

					<PhotoLightbox photos={event.photos} class="mt-6" />
				</section>
			{/if}

			<!-- Registration -->
			<section id="register" class="scroll-mt-24">
				<Card.Root class="mt-14 [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
					<Card.Header>
						<Card.Title class="text-xl font-semibold tracking-tight">
							{m.register_title({ event: event.title })}
						</Card.Title>
					</Card.Header>

					<Card.Content>
						{#if !canRegister}
							<Alert variant="destructive">
								<AlertCircle class="size-4" />
								<AlertDescription>
									{event.registrationState === 'full'
										? m.register_error_full()
										: m.register_error_closed()}
								</AlertDescription>
							</Alert>
						{:else}
							{#if form?.message}
								<Alert variant="destructive" class="mb-6">
									<AlertCircle class="size-4" />
									<AlertDescription>{form.message}</AlertDescription>
								</Alert>
							{/if}

							<form
								method="POST"
								action="?/register"
								use:enhance={() => {
									submitting = true;
									return async ({ update }) => {
										await update();
										submitting = false;
									};
								}}
							>
								<!--
									The questions belong to the event, not to this template. What is
									asked, in what order, and what is required are all decided in the
									backoffice form builder and rendered from the definition.
								-->
								<RegistrationForm
									blocks={event.form}
									errors={form?.fieldErrors ?? {}}
									values={form?.values ?? {}}
								/>

								<!-- Honeypot -->
								<div class="hidden" aria-hidden="true">
									<label for="website">Website</label>
									<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
								</div>

								<Button type="submit" size="lg" disabled={submitting} class="mt-7 w-full sm:w-auto">
									{#if submitting}<Spinner data-icon="inline-start" />{/if}
									{submitting ? m.register_submitting() : m.register_submit()}
								</Button>
							</form>
						{/if}
					</Card.Content>
				</Card.Root>
			</section>
		</div>
	</div>
</article>
