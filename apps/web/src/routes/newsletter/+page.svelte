<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Mail from '@lucide/svelte/icons/mail';

	// Reached only when JavaScript is unavailable — with `enhance` the visitor
	// never leaves the page they subscribed from.
	let { form } = $props();
</script>

<Seo title={m.newsletter_title()} noindex />

<section class="mx-auto grid max-w-xl place-items-center px-4 py-24">
	<Empty.Root>
		<Empty.Header>
			{#if form?.message}
				<Empty.Media variant="icon" class="bg-primary/10 text-primary size-12 rounded-xl">
					<CircleCheck class="size-6" />
				</Empty.Media>
				<h1 class="text-2xl font-bold tracking-tight text-balance">{form.message}</h1>
			{:else}
				<Empty.Media variant="icon" class="size-12 rounded-xl"><Mail class="size-6" /></Empty.Media>
				<h1 class="text-2xl font-bold tracking-tight text-balance">{m.newsletter_title()}</h1>
				<Empty.Description class="text-base">{m.newsletter_body()}</Empty.Description>
			{/if}
		</Empty.Header>

		<Empty.Content>
			<Button href={localizeHref('/')} variant="outline">{m.error_home()}</Button>
		</Empty.Content>
	</Empty.Root>
</section>
