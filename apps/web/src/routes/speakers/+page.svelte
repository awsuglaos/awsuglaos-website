<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import SpeakerCard from '$lib/components/SpeakerCard.svelte';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { roleLabel } from '$lib/speaker-role';
	import { page } from '$app/state';
	import { COMMUNITY_ROLE_ORDER } from '@awsug/shared';

	let { data } = $props();

	let team = $derived(data.speakers.filter((s) => s.communityRole !== 'none'));

	/*
	 * Grouped rather than one flat run, so the ordering the organisers set on the
	 * board is legible as a structure — leader, then co-leaders, then everyone
	 * who helps — instead of an unexplained sequence.
	 */
	let teamByRole = $derived(
		COMMUNITY_ROLE_ORDER.map((role) => ({
			role,
			people: team.filter((s) => s.communityRole === role)
		})).filter((group) => group.people.length > 0)
	);

	// Guests, alphabetically. There is no curated order here and pretending there
	// is one would just be an arbitrary ranking of volunteers.
	let guests = $derived(
		data.speakers
			.filter((s) => s.communityRole === 'none')
			.toSorted((a, b) => a.name.localeCompare(b.name))
	);

	// See the note on the event page's JSON-LD: `<` is escaped so a bio holding a
	// literal closing script tag cannot end this element early.
	let jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: m.speakers_title(),
			description: m.speakers_body(),
			url: new URL(page.url.pathname, page.url.origin).href,
			mainEntity: {
				'@type': 'ItemList',
				itemListElement: data.speakers.map((speaker, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					item: {
						'@type': 'Person',
						name: speaker.name,
						...(speaker.title ? { jobTitle: speaker.title } : {}),
						url: new URL(localizeHref(`/speakers/${speaker.slug}`), page.url.origin).href
					}
				}))
			}
		}).replace(/</g, '\\u003c')
	);
</script>

<Seo title={m.speakers_title()} description={m.speakers_body()} />

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- jsonLd is JSON.stringify output with `<` escaped; see the comment above it -->
	{@html '<script type="application/ld+json">' + jsonLd + '</scr' + 'ipt>'}
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<!--
		Centred, unlike /news and /events, because this page is a wall of faces
		rather than a column of rows — a left-aligned opening over centred
		portraits reads as two compositions stacked. The h1 scale still matches its
		sibling index pages.
	-->
	<div class="text-center">
		<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-6xl">
			{m.speakers_title()}
		</h1>
		<p class="text-muted-foreground mx-auto mt-4 max-w-[56ch] text-pretty">
			{m.speakers_body()}
		</p>
	</div>

	{#if teamByRole.length > 0}
		<section class="mt-16">
			<h2 class="text-center text-2xl font-bold tracking-tight sm:text-3xl">
				{m.speakers_team_heading()}
			</h2>

			{#each teamByRole as group (group.role)}
				<!--
					Deliberately NOT the mono annotation register, even though this is the
					same kind of label as a sponsor tier. `--font-mono` is `Fira Code,
					monospace` with no Lao fallback and no self-hosted file, so on the
					mid-range Android phones this site is built for it resolves to a
					generic monospace with no Lao glyphs. Every documented use of that
					register is Latin or numeric — coordinates, ticket codes, slugs, tier
					enums. These labels are translated, so they stay in the sans stack.
				-->
				<h3
					class="text-muted-foreground mt-12 text-center text-xs font-semibold tracking-[0.08em] uppercase first:mt-8"
				>
					{roleLabel(group.role)}
				</h3>
				<!-- Named: several lists share this page, and "list" alone tells a screen
				     reader nothing about which group it has landed in. -->
				<ul
					aria-label={roleLabel(group.role)}
					class="mt-6 flex list-none flex-wrap justify-center gap-x-6 gap-y-12 p-0 sm:gap-x-8 lg:gap-x-14"
				>
					{#each group.people as speaker (speaker.id)}
						<li class="w-40 min-w-0 sm:w-44 lg:w-56"><SpeakerCard {speaker} /></li>
					{/each}
				</ul>
			{/each}
		</section>
	{/if}

	{#if guests.length > 0}
		<section class="mt-20">
			<h2 class="text-center text-2xl font-bold tracking-tight sm:text-3xl">
				{m.speakers_all_heading()}
			</h2>
			<ul
				class="mt-8 flex list-none flex-wrap justify-center gap-x-6 gap-y-12 p-0 sm:gap-x-8 lg:gap-x-14"
			>
				{#each guests as speaker (speaker.id)}
					<li class="w-40 min-w-0 sm:w-44 lg:w-56"><SpeakerCard {speaker} /></li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
