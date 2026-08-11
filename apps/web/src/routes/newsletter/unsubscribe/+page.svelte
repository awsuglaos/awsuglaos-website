<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import Compass from '@lucide/svelte/icons/compass';
	import MailX from '@lucide/svelte/icons/mail-x';

	let { data } = $props();
</script>

<Seo title={m.newsletter_unsubscribed()} noindex />

<section class="mx-auto grid max-w-xl place-items-center px-4 py-24">
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon" class="size-12 rounded-xl">
				{#if data.ok}<MailX class="size-6" />{:else}<Compass class="size-6" />{/if}
			</Empty.Media>
			<h1 class="text-2xl font-bold tracking-tight text-balance">
				{data.ok ? m.newsletter_unsubscribed() : m.error_404_title()}
			</h1>
		</Empty.Header>

		<Empty.Content>
			<Button href={localizeHref('/')} variant="outline">{m.error_home()}</Button>
		</Empty.Content>
	</Empty.Root>
</section>
