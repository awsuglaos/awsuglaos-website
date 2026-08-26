<script lang="ts">
	import { enhance } from '$app/forms';
	import Seo from '$lib/components/Seo.svelte';
	import StarRating from '$lib/components/StarRating.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatDate, isoDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import MessageSquare from '@lucide/svelte/icons/message-square';

	let { data, form } = $props();
	let submitting = $state(false);

	const v = (name: 'name' | 'email' | 'subject' | 'message') => form?.values?.[name] ?? '';
	const error = (name: string) => form?.fieldErrors?.[name];
</script>

<Seo title={m.feedback_public_title()} description={m.feedback_public_intro()} />

<section class="mx-auto max-w-3xl px-4 py-12 sm:py-16">
	<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
		{m.feedback_public_title()}
	</h1>
	<p class="text-muted-foreground mt-4 max-w-xl text-pretty">{m.feedback_public_intro()}</p>

	<Card.Root class="mt-10 [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
		<Card.Content>
			{#if form?.sent}
				<Alert>
					<CircleCheck class="size-4" />
					<AlertDescription>{m.feedback_public_thanks()}</AlertDescription>
				</Alert>
			{:else}
				{#if form?.failed}
					<Alert variant="destructive" class="mb-6">
						<AlertCircle class="size-4" />
						<AlertDescription>{m.feedback_public_error()}</AlertDescription>
					</Alert>
				{/if}

				<form
					method="POST"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
				>
					<Field.FieldGroup>
						<div class="grid gap-5 sm:grid-cols-2">
							<Field.Field data-invalid={error('name') ? true : undefined}>
								<Field.FieldLabel for="name">
									{m.feedback_public_name()}
									<span class="text-muted-foreground font-normal">
										({m.register_optional()})
									</span>
								</Field.FieldLabel>
								<Input id="name" name="name" autocomplete="name" value={v('name')} />
							</Field.Field>

							<Field.Field data-invalid={error('email') ? true : undefined}>
								<Field.FieldLabel for="email">
									{m.feedback_public_email()}
									<span class="text-muted-foreground font-normal">
										({m.register_optional()})
									</span>
								</Field.FieldLabel>
								<Input
									id="email"
									name="email"
									type="email"
									autocomplete="email"
									value={v('email')}
									aria-invalid={error('email') ? 'true' : undefined}
									aria-describedby={error('email') ? 'email-error' : 'email-help'}
								/>
								{#if error('email')}
									<Field.FieldError id="email-error">{error('email')}</Field.FieldError>
								{:else}
									<Field.FieldDescription id="email-help">
										{m.feedback_public_email_help()}
									</Field.FieldDescription>
								{/if}
							</Field.Field>
						</div>

						<Field.Field data-invalid={error('subject') ? true : undefined}>
							<Field.FieldLabel for="subject">
								{m.feedback_public_subject()}
								<span class="text-muted-foreground font-normal">({m.register_optional()})</span>
							</Field.FieldLabel>
							<Input id="subject" name="subject" value={v('subject')} />
						</Field.Field>

						<Field.Field data-invalid={error('message') ? true : undefined}>
							<Field.FieldLabel for="message">{m.feedback_public_message()}</Field.FieldLabel>
							<Textarea
								id="message"
								name="message"
								rows={6}
								required
								value={v('message')}
								aria-invalid={error('message') ? 'true' : undefined}
								aria-describedby={error('message') ? 'message-error' : undefined}
							/>
							{#if error('message')}
								<Field.FieldError id="message-error">{error('message')}</Field.FieldError>
							{/if}
						</Field.Field>

						<Field.Field>
							<StarRating name="rating" legend={m.feedback_public_rating()} />
						</Field.Field>
					</Field.FieldGroup>

					<!-- Honeypot -->
					<div class="hidden" aria-hidden="true">
						<label for="website">Website</label>
						<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
					</div>

					<Button type="submit" size="lg" disabled={submitting} class="mt-7 w-full sm:w-auto">
						{#if submitting}<Spinner data-icon="inline-start" />{/if}
						{submitting ? m.feedback_public_submitting() : m.feedback_public_submit()}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>

	<!--
		Only approved messages reach this list — `listApprovedFeedback` filters on
		status, so nothing pending or archived can appear here by accident.
	-->
	<h2 class="mt-16 text-2xl font-bold tracking-tight">{m.feedback_wall_title()}</h2>

	{#if data.entries.length === 0}
		<Empty.Root class="mt-6">
			<Empty.Header>
				<Empty.Media variant="icon"><MessageSquare /></Empty.Media>
				<Empty.Description>{m.feedback_wall_empty()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<ul class="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2">
			{#each data.entries as entry (entry.id)}
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

							{#if entry.subject}
								<p class="font-medium">{entry.subject}</p>
							{/if}

							<p class="text-muted-foreground flex-1 text-sm whitespace-pre-line">
								{entry.message}
							</p>

							<p class="text-muted-foreground/70 text-xs">
								{entry.name ?? m.feedback_anonymous()}
								· <time datetime={isoDate(entry.createdAt)}>{formatDate(entry.createdAt)}</time>
								{#if entry.eventSlug}
									·
									<a
										href={localizeHref(`/events/${entry.eventSlug}`)}
										class="hover:text-foreground underline underline-offset-4"
									>
										{entry.eventSlug}
									</a>
								{/if}
							</p>
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/if}
</section>
