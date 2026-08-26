<script lang="ts">
	import BrandLogo from '$lib/components/brand-logo.svelte';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';

	const links = $derived([
		{ href: localizeHref('/events'), label: m.nav_events(), external: false },
		{ href: localizeHref('/news'), label: m.nav_news(), external: false },
		{ href: localizeHref('/feedback'), label: m.nav_feedback(), external: false },
		{ href: 'https://github.com/awsuglaos', label: m.footer_source(), external: true }
	]);
</script>

<!--
	A statement footer rather than a link farm: the site has three destinations,
	and four columns of two links each would be scaffolding pretending to be
	structure. The lockup carries the name and the links sit beside it.
-->
<footer class="border-border/80 mt-24 border-t">
	<div
		class="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:flex-row sm:items-start sm:justify-between"
	>
		<div class="flex max-w-md min-w-0 flex-col gap-4">
			<!--
				The lockup already reads "aws User Group Laos", so it is the naming
				element here and takes a real alt text — unlike the header mark,
				which sits beside live text.
			-->
			<BrandLogo variant="lockup" class="w-28" alt={m.site_name()} />
			<p class="text-muted-foreground text-sm text-pretty">{m.footer_built_with()}</p>

			<!--
				The map's street network comes from OpenStreetMap, which is ODbL, and its
				terrain from the AWS Open Data terrain tiles. Attribution is a licence
				condition, not a courtesy, so it lives in the footer where it is present on
				every page that can show the map. Do not remove it.
			-->
			<p class="text-muted-foreground/70 font-mono text-[0.6875rem] tracking-[0.14em] uppercase">
				<a
					href="https://www.openstreetmap.org/copyright"
					rel="noopener noreferrer license"
					target="_blank"
					class="hover:text-muted-foreground focus-visible:ring-ring rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					{m.map_source()}
				</a>
			</p>
		</div>

		<nav class="flex flex-col gap-3 sm:items-end" aria-label={m.nav_menu()}>
			{#each links as link (link.href)}
				<a
					href={link.href}
					rel={link.external ? 'noopener noreferrer' : undefined}
					target={link.external ? '_blank' : undefined}
					class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					{link.label}
					{#if link.external}
						<ArrowUpRight class="size-3.5" aria-hidden="true" />
					{/if}
				</a>
			{/each}
		</nav>
	</div>
</footer>
