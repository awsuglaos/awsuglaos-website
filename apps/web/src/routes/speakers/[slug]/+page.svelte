<script lang="ts">
	import { page } from '$app/state';
	import Seo from '$lib/components/Seo.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { formatDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { roleLabel } from '$lib/speaker-role';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data } = $props();
	let speaker = $derived(data.speaker);

	let subtitle = $derived([speaker.title, speaker.company].filter(Boolean).join(' · '));

	let links = $derived(
		[
			{ href: speaker.websiteUrl, label: 'Website' },
			{ href: speaker.linkedinUrl, label: 'LinkedIn' },
			{ href: speaker.githubUrl, label: 'GitHub' }
		].filter((link): link is { href: string; label: string } => !!link.href)
	);

	let canonical = $derived(new URL(page.url.pathname, page.url.origin).href);

	/*
	 * `Person` rather than `ProfilePage`: the subject here is the speaker, and
	 * `memberOf` is what ties them to the group so the two entities are connected
	 * rather than floating separately.
	 *
	 * The `<` escape and the split closing tag below are the same guard the event
	 * page uses — a bio containing a literal closing script tag would otherwise
	 * end this element early and run the rest as markup.
	 */
	let jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'Person',
			name: speaker.name,
			...(speaker.title ? { jobTitle: speaker.title } : {}),
			...(speaker.company ? { worksFor: { '@type': 'Organization', name: speaker.company } } : {}),
			...(speaker.bio ? { description: speaker.bio.slice(0, 300) } : {}),
			...(speaker.photoUrl ? { image: [speaker.photoUrl] } : {}),
			url: canonical,
			...(links.length > 0 ? { sameAs: links.map((link) => link.href) } : {}),
			memberOf: { '@type': 'Organization', name: 'AWS User Group Lao' },
			...(speaker.talks.length > 0
				? {
						performerIn: speaker.talks.map((talk) => ({
							'@type': 'Event',
							name: talk.eventTitle,
							startDate: talk.startAt.toISOString(),
							url: new URL(localizeHref(`/events/${talk.eventSlug}`), page.url.origin).href
						}))
					}
				: {})
		}).replace(/</g, '\\u003c')
	);
</script>

<Seo
	title={speaker.name}
	description={speaker.bio?.slice(0, 160) ?? subtitle}
	image={speaker.photoUrl}
/>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- jsonLd is JSON.stringify output with `<` escaped; see the comment above it -->
	{@html '<script type="application/ld+json">' + jsonLd + '</scr' + 'ipt>'}
</svelte:head>

<article class="mx-auto max-w-3xl px-4 py-10 sm:py-14">
	<a
		href={localizeHref('/speakers')}
		class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
	>
		<ArrowLeft class="size-4" aria-hidden="true" />
		{m.speakers_title()}
	</a>

	<header class="mt-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
		<Avatar.Root class="size-24 shrink-0 sm:size-28">
			{#if speaker.photoUrl}
				<Avatar.Image src={speaker.photoUrl} alt="" />
			{/if}
			<Avatar.Fallback class="text-3xl font-semibold">
				{speaker.name.slice(0, 1)}
			</Avatar.Fallback>
		</Avatar.Root>

		<div class="min-w-0">
			<h1 class="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{speaker.name}</h1>

			{#if speaker.communityRole !== 'none'}
				<Badge variant="secondary" class="mt-3">{roleLabel(speaker.communityRole)}</Badge>
			{/if}

			{#if subtitle}
				<p class="text-muted-foreground mt-3 text-lg text-pretty">{subtitle}</p>
			{/if}

			{#if links.length > 0}
				<p class="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
					{#each links as link (link.label)}
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="{speaker.name} on {link.label}"
							class="hover:text-foreground underline underline-offset-4"
						>
							{link.label}
						</a>
					{/each}
				</p>
			{/if}
		</div>
	</header>

	{#if speaker.bio}
		<p class="mt-9 max-w-[68ch] text-lg leading-relaxed text-pretty">{speaker.bio}</p>
	{/if}

	<section class="mt-12">
		<h2 class="text-xl font-semibold tracking-tight">{m.speaker_talks()}</h2>

		{#if speaker.talks.length > 0}
			<ul class="mt-5 grid list-none gap-4 p-0">
				{#each speaker.talks as talk (talk.eventSlug)}
					<li>
						<Card.Root>
							<Card.Header>
								<Card.Title class="text-base">
									<a
										href={localizeHref(`/events/${talk.eventSlug}`)}
										class="hover:text-primary focus-visible:ring-ring rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
									>
										{talk.talkTitle ?? talk.eventTitle}
									</a>
								</Card.Title>
								<Card.Description class="mt-1">
									{#if talk.talkTitle}{talk.eventTitle} ·
									{/if}
									<time datetime={talk.startAt.toISOString()}>{formatDate(talk.startAt)}</time>
								</Card.Description>
							</Card.Header>

							{#if talk.abstract}
								<Card.Content>
									<p class="text-muted-foreground text-sm text-pretty">{talk.abstract}</p>
								</Card.Content>
							{/if}
						</Card.Root>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-muted-foreground mt-4 text-sm">{m.speaker_no_talks()}</p>
		{/if}
	</section>
</article>
