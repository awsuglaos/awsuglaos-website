<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Mail from '@lucide/svelte/icons/mail';

	// Not named `state` — that shadows the $state rune.
	let status = $state<'idle' | 'submitting' | 'done' | 'error'>('idle');
	let message = $state('');
</script>

<!--
	A full-bleed accent panel rather than another bordered card: this is the last
	thing on the page, and it has to read as an invitation rather than as one
	more item in the stack above it.
-->
<section
	class="border-primary/20 from-primary/10 relative isolate overflow-hidden rounded-2xl border bg-linear-to-br to-transparent p-6 sm:p-10"
>
	<div class="max-w-xl">
		<h2 class="text-2xl font-bold tracking-tight text-balance">{m.newsletter_title()}</h2>
		<p class="text-muted-foreground mt-2 text-pretty">{m.newsletter_body()}</p>

		{#if status === 'done'}
			<p class="text-primary mt-6 flex items-center gap-2 text-sm font-medium">
				<CircleCheck class="size-4 shrink-0" aria-hidden="true" />
				{message || m.newsletter_success()}
			</p>
		{:else}
			<!--
				Posts to the dedicated /newsletter route so the same form works from any
				page. Without JavaScript the browser navigates there and sees the
				confirmation; with JavaScript `enhance` keeps the visitor in place.
			-->
			<form
				method="POST"
				action="{localizeHref('/newsletter')}?/subscribe"
				class="mt-6"
				use:enhance={() => {
					status = 'submitting';
					return async ({ result }) => {
						if (result.type === 'success') {
							status = 'done';
							message = (result.data?.message as string) ?? '';
						} else if (result.type === 'failure') {
							status = 'error';
							message = (result.data?.message as string) ?? m.newsletter_error();
						} else {
							await applyAction(result);
						}
					};
				}}
			>
				<Field.Field data-invalid={status === 'error' ? true : undefined}>
					<Field.FieldLabel for="newsletter-email" class="sr-only">
						{m.newsletter_email_label()}
					</Field.FieldLabel>

					<div class="flex flex-col gap-3 sm:flex-row">
						<Input
							id="newsletter-email"
							name="email"
							type="email"
							required
							autocomplete="email"
							placeholder={m.newsletter_placeholder()}
							aria-describedby={status === 'error' ? 'newsletter-error' : undefined}
							aria-invalid={status === 'error' ? 'true' : undefined}
							class="sm:max-w-sm"
						/>

						<Button type="submit" disabled={status === 'submitting'} class="shrink-0">
							{#if status === 'submitting'}
								<Spinner data-icon="inline-start" />
							{:else}
								<Mail data-icon="inline-start" />
							{/if}
							{m.newsletter_submit()}
						</Button>
					</div>

					{#if status === 'error'}
						<Field.FieldError id="newsletter-error">{message}</Field.FieldError>
					{/if}
				</Field.Field>

				<!-- Honeypot: hidden from people, irresistible to bots. -->
				<div class="hidden" aria-hidden="true">
					<label for="newsletter-website">Website</label>
					<input
						id="newsletter-website"
						name="website"
						type="text"
						tabindex="-1"
						autocomplete="off"
					/>
				</div>
			</form>
		{/if}
	</div>
</section>
