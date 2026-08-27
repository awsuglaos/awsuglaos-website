<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { roleLabel } from '$lib/speaker-role';
	import type { SpeakerCardView } from '@awsug/core';

	interface Props {
		speaker: SpeakerCardView;
		/** Show the community role. Off in the A–Z list, where nobody has one. */
		showRole?: boolean;
	}

	let { speaker, showRole = false }: Props = $props();

	let subtitle = $derived([speaker.title, speaker.company].filter(Boolean).join(' · '));
</script>

<!--
	A wall of faces, not a grid of cards.

	The person is the content, so the portrait is the largest thing here and
	everything else is its caption. An earlier version put a 56px avatar in the
	corner of a bordered card with the bio underneath, which inverted that: the
	card chrome and a one-line bio read louder than the face. Proximity does the
	grouping instead — a tight caption stack under each portrait, generous air
	between people — and the bio moves to the profile page, where there is room
	for it.

	One link wraps portrait and name together. Two adjacent links to the same
	profile would be a duplicate stop for a screen reader, and the portrait is far
	too big a target to leave dead.
-->
<div class="flex flex-col items-center text-center">
	<a
		href={localizeHref(`/speakers/${speaker.slug}`)}
		class="group focus-visible:ring-ring flex w-full min-w-0 flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
	>
		<Avatar.Root class="lift size-32 sm:size-36 lg:size-48">
			<!--
				Only mounted when there is a photo: bits-ui treats a missing `src` as an
				image still loading, which leaves the fallback initial hidden behind an
				empty circle. Same reasoning as the event page line-up.
			-->
			{#if speaker.photoUrl}
				<Avatar.Image src={speaker.photoUrl} alt="" class="object-cover" />
			{/if}
			<Avatar.Fallback class="text-4xl font-semibold sm:text-5xl">
				{speaker.name.slice(0, 1)}
			</Avatar.Fallback>
		</Avatar.Root>

		<span
			class="group-hover:text-primary mt-5 text-lg font-semibold tracking-tight text-balance transition-colors [overflow-wrap:anywhere]"
		>
			{speaker.name}
		</span>
	</a>

	{#if showRole && speaker.communityRole !== 'none'}
		<Badge variant="secondary" class="mt-2.5">{roleLabel(speaker.communityRole)}</Badge>
	{/if}

	{#if subtitle}
		<p class="text-muted-foreground mt-2 text-sm text-balance [overflow-wrap:anywhere]">
			{subtitle}
		</p>
	{/if}
</div>
