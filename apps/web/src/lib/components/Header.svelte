<script lang="ts">
	import { page } from '$app/state';
	import BrandLogo from '$lib/components/brand-logo.svelte';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { cn } from '$lib/utils';
	import Menu from '@lucide/svelte/icons/menu';

	let open = $state(false);

	const links = $derived([
		{ href: '/events', label: m.nav_events() },
		{ href: '/news', label: m.nav_news() }
	]);

	// Compare against the de-localized path so /en/events highlights too.
	function isActive(href: string): boolean {
		const path = page.url.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
		return href === '/' ? path === '/' : path.startsWith(href);
	}

	// Close the mobile sheet when the route changes.
	$effect(() => {
		void page.url.pathname;
		open = false;
	});
</script>

<header
	class="border-border/80 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur-md"
>
	<!--
		Three sections: brand, destinations, controls. The nav sits in the middle
		column on desktop so it reads as the page's spine rather than as a tail on
		the wordmark; below `md` the middle column collapses into the sheet.
	-->
	<div
		class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:grid md:grid-cols-[1fr_auto_1fr]"
	>
		<!--
			The lockup badge, which already carries "aws User Group Laos" inside it. At header
			size that inner lettering is far too small to read, so the wordmark stays beside it
			doing the actual naming — the badge is recognised, the text is read.
		-->
		<a
			href={localizeHref('/')}
			class="group focus-visible:ring-ring mr-auto flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:mr-0"
		>
			<BrandLogo
				variant="lockup"
				class="size-10 shrink-0 transition-transform group-hover:-translate-y-px"
				eager
			/>
			<span class="min-w-0 truncate text-[0.9375rem] leading-tight font-semibold tracking-tight">
				{m.site_name()}
			</span>
		</a>

		<NavigationMenu.Root class="hidden md:flex" viewport={false}>
			<NavigationMenu.List class="gap-1">
				{#each links as link (link.href)}
					<NavigationMenu.Item>
						<NavigationMenu.Link>
							{#snippet child({ props })}
								<!--
									`class` is set after the spread so it replaces the
									primitive's default outright. Keeping both would layer a
									filled hover pill under the underline below.
								-->
								<a
									{...props}
									href={localizeHref(link.href)}
									aria-current={isActive(link.href) ? 'page' : undefined}
									class={cn(
										'text-muted-foreground hover:text-foreground focus-visible:ring-ring relative rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
										// A drawn underline, not a filled pill: it marks the
										// current page without competing with the CTA colour.
										'after:bg-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:transition-transform',
										'aria-[current=page]:text-foreground aria-[current=page]:after:scale-x-100'
									)}
								>
									{link.label}
								</a>
							{/snippet}
						</NavigationMenu.Link>
					</NavigationMenu.Item>
				{/each}
			</NavigationMenu.List>
		</NavigationMenu.Root>

		<div class="ml-auto flex items-center gap-1 md:ml-0 md:justify-end">
			<div class="hidden sm:block"><LanguageToggle /></div>
			<ThemeToggle />

			<Sheet.Root bind:open>
				<Sheet.Trigger
					class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'md:hidden')}
					aria-label={m.nav_menu()}
				>
					<Menu class="size-5" />
				</Sheet.Trigger>

				<Sheet.Content side="right" class="w-[min(20rem,85vw)] gap-0 p-0">
					<Sheet.Header class="border-border border-b p-4">
						<Sheet.Title class="flex items-center gap-2.5 text-left">
							<BrandLogo class="size-8 shrink-0" />
							<span class="truncate text-base">{m.site_name()}</span>
						</Sheet.Title>
						<Sheet.Description class="sr-only">{m.nav_menu()}</Sheet.Description>
					</Sheet.Header>

					<nav class="flex flex-col gap-1 p-3" aria-label={m.nav_menu()}>
						{#each links as link (link.href)}
							<a
								href={localizeHref(link.href)}
								aria-current={isActive(link.href) ? 'page' : undefined}
								class="hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:text-foreground text-muted-foreground rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
							>
								{link.label}
							</a>
						{/each}

						<Separator class="my-2" />
						<div class="px-1 sm:hidden"><LanguageToggle /></div>
					</nav>
				</Sheet.Content>
			</Sheet.Root>
		</div>
	</div>
</header>
