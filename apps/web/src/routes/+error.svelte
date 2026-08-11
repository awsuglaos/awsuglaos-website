<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import Compass from '@lucide/svelte/icons/compass';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let notFound = $derived(page.status === 404);
</script>

<section class="mx-auto grid max-w-2xl place-items-center px-4 py-24">
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon" class="size-12 rounded-xl">
				{#if notFound}
					<Compass class="size-6" />
				{:else}
					<TriangleAlert class="size-6" />
				{/if}
			</Empty.Media>

			<p class="text-muted-foreground font-mono text-sm tabular-nums">{page.status}</p>

			<!--
				A real <h1>, not Empty.Title: this is the page's heading, and
				Empty.Title renders a plain <div> — which would leave the error page
				with no heading at all in the accessibility tree.
			-->
			<h1 class="text-2xl font-bold tracking-tight text-balance">
				{notFound ? m.error_404_title() : m.error_500_title()}
			</h1>

			<Empty.Description class="text-base">
				{notFound ? m.error_404_body() : m.error_500_body()}
			</Empty.Description>
		</Empty.Header>

		<Empty.Content>
			<Button href={localizeHref('/')}>{m.error_home()}</Button>
		</Empty.Content>
	</Empty.Root>
</section>
