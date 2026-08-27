<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import { roleLabel } from '$lib/speaker-role';
	import { Badge } from '$lib/components/ui/badge';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import type { SpeakerCardView } from '@awsug/core';

	interface Props {
		speaker: SpeakerCardView;
		/** Show the community role badge. Off in the A–Z list, where nobody has one. */
		showRole?: boolean;
	}

	let { speaker, showRole = false }: Props = $props();

	let subtitle = $derived([speaker.title, speaker.company].filter(Boolean).join(' · '));
</script>

<Card.Root class="h-full">
	<Card.Header class="flex flex-row items-start gap-4">
		<Avatar.Root class="size-14 shrink-0">
			<!--
				Only mounted when there is a photo: bits-ui treats a missing `src` as an
				image still loading, which leaves the fallback initial hidden behind an
				empty circle. Same reasoning as the event page line-up.
			-->
			{#if speaker.photoUrl}
				<Avatar.Image src={speaker.photoUrl} alt="" />
			{/if}
			<Avatar.Fallback class="text-base font-semibold">
				{speaker.name.slice(0, 1)}
			</Avatar.Fallback>
		</Avatar.Root>

		<div class="min-w-0 flex-1">
			<Card.Title>
				<!--
					The whole card is not a link: the bio below can run long, and a link
					wrapping several lines of prose reads as one enormous target to a
					screen reader. The name is the target.
				-->
				<a
					href={localizeHref(`/speakers/${speaker.slug}`)}
					class="hover:text-primary focus-visible:ring-ring rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					{speaker.name}
				</a>
			</Card.Title>

			{#if showRole && speaker.communityRole !== 'none'}
				<Badge variant="secondary" class="mt-1.5">{roleLabel(speaker.communityRole)}</Badge>
			{/if}

			{#if subtitle}
				<Card.Description class="mt-1">{subtitle}</Card.Description>
			{/if}
		</div>
	</Card.Header>

	{#if speaker.bio}
		<Card.Content>
			<p class="text-muted-foreground line-clamp-4 text-sm">{speaker.bio}</p>
		</Card.Content>
	{/if}
</Card.Root>
