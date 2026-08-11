<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import Footer from '$lib/components/Footer.svelte';
	import Header from '$lib/components/Header.svelte';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();

	/*
	 * The backoffice brings its own shell — a sidebar, an inset header and a
	 * breadcrumb — so the public marketing header and footer must not wrap it.
	 * SvelteKit always applies the root layout, so the split happens here.
	 *
	 * The locale prefix is stripped first: paraglide localises every path, so
	 * the backoffice is reachable at both /admin and /en/admin.
	 */
	let isBackoffice = $derived(
		page.url.pathname.replace(/^\/en(?=\/|$)/, '').startsWith('/admin')
	);

	/*
	 * Switching language is a client-side navigation, which leaves this layout mounted —
	 * so without help the header and footer would keep rendering the previous language's
	 * labels. Re-keying the shell on the locale re-renders it, which is what lets the
	 * language toggle avoid a full document reload. Derived from the path rather than from
	 * `getLocale()` so it tracks the URL SvelteKit has actually navigated to.
	 */
	let locale = $derived(/^\/en(\/|$)/.test(page.url.pathname) ? 'en' : 'lo');

	/*
	 * `<html lang>` is stamped by paraglide at SSR and would otherwise go stale after a
	 * client navigation. It is not cosmetic here: `layout.css` hangs Lao's extra leading and
	 * its no-italic rule off `:lang(lo)`, and assistive tech picks its voice from it.
	 */
	$effect(() => {
		document.documentElement.lang = locale;
	});
</script>

<!--
	The Impeccable direction contract for this redesign lives in `src/app.html`, not here:
	the Svelte compiler strips comments from production output, so a contract placed in a
	component cannot be audited in the shipped page.
-->

<!--
	Injects a blocking inline script that sets the `dark` class before first
	paint, so a dark-mode visitor never sees a white flash on load. `theme.css`
	declares `@custom-variant dark (&:is(.dark *))`, which this drives.
-->
<ModeWatcher />

<a
	href="#main"
	class="skip-link bg-background border-border rounded-md border px-4 py-2 text-sm font-medium shadow-md"
>
	Skip to content
</a>

{#key locale}
	{#if isBackoffice}
		<div id="main">{@render children()}</div>
	{:else}
		<div class="flex min-h-dvh flex-col">
			<Header />
			<main id="main" class="flex-1">
				{@render children()}
			</main>
			<Footer />
		</div>
	{/if}
{/key}
