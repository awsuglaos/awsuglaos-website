<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { formatEventRange, isoDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Printer from '@lucide/svelte/icons/printer';

	let { data } = $props();
</script>

<Seo title={m.ticket_title()} noindex />

<section class="mx-auto max-w-lg px-4 py-12">
	<div class="text-center print:hidden">
		<span
			class="bg-primary/10 text-primary mx-auto grid size-14 place-items-center rounded-full"
			aria-hidden="true"
		>
			<CircleCheck class="size-7" />
		</span>
		<h1 class="mt-5 text-2xl font-bold tracking-tight">{m.register_success_title()}</h1>
		<p class="text-muted-foreground mt-2 text-sm text-pretty">
			{m.register_success_body({ email: data.registration.email })}
		</p>
	</div>

	<!--
		Deliberately not a `Card`: a ticket is its own object, with a perforation
		and a torn edge, and the card's footer rule would read as a seam in the
		wrong place. It keeps the card's radius and ring so it still belongs to
		the system.
	-->
	<div class="ring-foreground/10 bg-card mt-10 overflow-hidden rounded-xl ring-1 print:mt-0">
		<div class="p-6">
			<h2 class="text-lg font-semibold tracking-tight">{data.event.title}</h2>
			<dl class="text-muted-foreground mt-3 grid gap-2 text-sm">
				<div class="flex items-start gap-2">
					<dt class="sr-only">{m.event_when()}</dt>
					<CalendarDays class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<dd class="min-w-0">
						<time datetime={isoDate(data.event.startAt)}>
							{formatEventRange(data.event.startAt, data.event.endAt)}
						</time>
					</dd>
				</div>
				{#if data.event.locationName}
					<div class="flex items-start gap-2">
						<dt class="sr-only">{m.event_where()}</dt>
						<MapPin class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<dd class="min-w-0">{data.event.locationName}</dd>
					</div>
				{/if}
			</dl>
		</div>

		<!-- Perforation, so the ticket reads as a ticket. -->
		<div class="border-border relative border-t border-dashed">
			<div
				class="bg-background border-border absolute -top-2.5 -left-2.5 size-5 rounded-full border"
				aria-hidden="true"
			></div>
			<div
				class="bg-background border-border absolute -top-2.5 -right-2.5 size-5 rounded-full border"
				aria-hidden="true"
			></div>
		</div>

		<div class="grid place-items-center gap-4 p-6">
			<!--
				Stays white in both themes on purpose: a QR scanner needs the light
				modules brighter than the dark ones, and inverting it in dark mode
				makes the code unreadable to most phone cameras.
			-->
			<div class="rounded-lg bg-white p-3 [&_svg]:size-44">
				<!--
					Safe: qrSvg is SVG markup produced by the `qrcode` encoder on the
					server from a ULID ticket code — [0-9A-HJKMNP-TV-Z]{26}. No user
					input reaches it, so there is nothing here to escape.
				-->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-generated SVG, see above -->
				{@html data.qrSvg}
			</div>

			<div class="text-center">
				<p class="text-muted-foreground text-xs tracking-wide uppercase">
					{m.register_ticket_code()}
				</p>
				<p class="mt-1 font-mono text-sm font-semibold tracking-wider break-all">
					{data.registration.ticketCode}
				</p>
			</div>

			<p class="text-sm font-medium">{data.registration.fullName}</p>

			{#if data.registration.checkedInAt}
				<Badge variant="secondary">{m.ticket_checked_in()}</Badge>
			{:else}
				<Badge variant="outline">{m.ticket_not_checked_in()}</Badge>
			{/if}
		</div>
	</div>

	{#if data.feedbackOpen}
		<div class="border-border mt-6 rounded-xl border border-dashed p-6 text-center print:hidden">
			<p class="text-sm font-medium">{m.feedback_title()}</p>
			<p class="text-muted-foreground mt-1 text-sm text-pretty">{m.feedback_intro()}</p>
			<Button
				href={localizeHref(
					`/events/${data.event.slug}/feedback/${data.registration.ticketCode}`
				)}
				class="mt-4"
			>
				{m.ticket_feedback_cta()}
			</Button>
		</div>
	{/if}

	<div class="mt-6 flex flex-wrap justify-center gap-3 print:hidden">
		<Button variant="outline" onclick={() => window.print()}>
			<Printer data-icon="inline-start" />
			{m.ticket_print()}
		</Button>
		<Button variant="ghost" href={localizeHref(`/events/${data.event.slug}`)}>
			{m.event_back()}
		</Button>
	</div>
</section>

<style>
	@media print {
		:global(header),
		:global(footer) {
			display: none;
		}
	}
</style>
