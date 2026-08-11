<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { formatDateTime, isoDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import type { RegistrationState } from '@awsug/shared';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import MapPin from '@lucide/svelte/icons/map-pin';

	interface Props {
		event: {
			slug: string;
			title: string;
			startAt: Date;
			locationName: string;
			coverImageUrl: string | null;
			registrationState: RegistrationState;
			seatsRemaining: number | null;
		};
		/** Set while this event's pin is the active one on the city model. */
		highlighted?: boolean;
	}

	let { event, highlighted = false }: Props = $props();
</script>

<!--
	`Card.Root` carries `has-[>img:first-child]:pt-0` and rounds a leading image
	itself, so the cover stays a direct child rather than going through a
	wrapper — that is what keeps the top edge flush.
-->
<Card.Root
	class="lift group relative h-full {highlighted
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
			<!--
				The whole card is clickable via ::after, but the anchor stays wrapped
				around the title so screen readers and the tab order get a real link
				with a meaningful name.
			-->
			<a
				href={localizeHref(`/events/${event.slug}`)}
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

	<!--
		`mt-auto` so a card whose title runs to one line still lines its status up
		with the taller cards beside it in the grid.
	-->
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
