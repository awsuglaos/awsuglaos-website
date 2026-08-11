<script lang="ts">
	import { page } from '$app/state';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, localizeHref, type Locale } from '$lib/paraglide/runtime';
	import { cn } from '$lib/utils';
	import Languages from '@lucide/svelte/icons/languages';

	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();

	// Two locales, so the toggle is a single link to "the other one" rather than
	// a dropdown — one tap instead of two, and nothing to open. It points at the
	// current path in the other language, which keeps a reader in place instead
	// of dropping them on the home page.
	let other = $derived<Locale>(getLocale() === 'lo' ? 'en' : 'lo');
	let href = $derived(localizeHref(page.url.pathname + page.url.search, { locale: other }));
</script>

<!--
	A normal client-side navigation, deliberately.

	This used to carry `data-sveltekit-reload` on the theory that only the server
	could resolve the locale. It can't have been true — paraglide's `getLocale()`
	re-reads `window.location` on every call — and the full document swap it forced
	was doing real damage: for a few hundred milliseconds the browser composited the
	outgoing English hero over the incoming Lao one, so both headlines, both
	subtitles and both button rows were visible at once.

	What the reload *was* covering for is that the root layout persists across a
	client navigation and would keep the old language's nav labels. The root layout
	now re-keys itself on the locale, which re-renders the shell without throwing
	the document away.
-->
<a
	{href}
	hreflang={other}
	lang={other}
	class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5', className)}
>
	<Languages class="size-4" aria-hidden="true" />
	{m.language_switch()}
</a>
