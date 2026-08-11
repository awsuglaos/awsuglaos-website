<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import StarRating from '$lib/components/StarRating.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Clock from '@lucide/svelte/icons/clock';

	let { data, form } = $props();
	let done = $derived(form?.submitted === true || data.alreadySubmitted);
</script>

<Seo title={m.feedback_title()} noindex />

<section class="mx-auto max-w-xl px-4 py-14 sm:py-20">
	{#if data.notOpen}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon" class="size-12 rounded-xl"><Clock class="size-6" /></Empty.Media>
				<h1 class="text-2xl font-bold tracking-tight text-balance">{m.feedback_title()}</h1>
				<Empty.Description class="text-base">{m.feedback_not_open()}</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href={localizeHref('/events')} variant="outline">{m.event_back()}</Button>
			</Empty.Content>
		</Empty.Root>
	{:else if done}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon" class="bg-primary/10 text-primary size-12 rounded-xl">
					<CircleCheck class="size-6" />
				</Empty.Media>
				<h1 class="text-2xl font-bold tracking-tight text-balance">
					{m.feedback_thanks_title()}
				</h1>
				<Empty.Description class="text-base">
					{data.alreadySubmitted && !form?.submitted
						? m.feedback_already()
						: m.feedback_thanks_body()}
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href={localizeHref('/events')} variant="outline">{m.events_view_all()}</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<h1 class="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{m.feedback_title()}</h1>
		<p class="text-muted-foreground mt-2 font-medium">{data.eventTitle}</p>
		<p class="text-muted-foreground mt-4 text-pretty">{m.feedback_intro()}</p>

		{#if form?.message}
			<Alert variant="destructive" class="mt-6">
				<AlertCircle class="size-4" />
				<AlertDescription>{form.message}</AlertDescription>
			</Alert>
		{/if}

		<Separator class="mt-8" />

		<form method="POST" class="mt-8">
			<Field.FieldGroup>
				<!--
					The three ratings sit together above a rule: they are the quick,
					tappable part, and separating them from the writing makes the form
					feel finishable at a glance.
				-->
				<div class="flex flex-col gap-5">
					<StarRating name="overallRating" legend={m.feedback_overall()} required />
					<StarRating name="venueRating" legend={m.feedback_venue()} />
					<StarRating name="contentRating" legend={m.feedback_content()} />
				</div>

				<Field.FieldSeparator />

				<Field.Field>
					<Field.FieldLabel for="whatWentWell">{m.feedback_went_well()}</Field.FieldLabel>
					<Textarea id="whatWentWell" name="whatWentWell" rows={3} />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="whatToImprove">{m.feedback_improve()}</Field.FieldLabel>
					<Textarea id="whatToImprove" name="whatToImprove" rows={3} />
				</Field.Field>

				<!--
					`value="on"` is stated rather than left to the browser default:
					feedbackInputSchema accepts the literal "on", and relying on an
					implicit value would break silently if bits-ui ever emitted a
					different one.
				-->
				<Field.Field orientation="horizontal">
					<Checkbox id="allowPublic" name="allowPublic" value="on" />
					<Field.FieldLabel for="allowPublic" class="font-normal">
						{m.feedback_allow_public()}
					</Field.FieldLabel>
				</Field.Field>
			</Field.FieldGroup>

			<!-- Honeypot -->
			<div class="hidden" aria-hidden="true">
				<label for="website">Website</label>
				<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
			</div>

			<Button type="submit" size="lg" class="mt-8 w-full sm:w-auto">{m.feedback_submit()}</Button>
		</form>
	{/if}
</section>
