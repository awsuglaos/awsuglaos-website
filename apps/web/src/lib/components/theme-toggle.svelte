<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { mode, toggleMode } from 'mode-watcher';

	/*
	 * A single switch, not a menu.
	 *
	 * This was a three-item dropdown with Light / Dark / System. It is worth recording what
	 * that trade cost, because it is a real one: "system" is a genuine preference, and a
	 * two-way switch strands anyone whose OS flips at sunset — after one tap here they are
	 * pinned to whatever they chose. The switch was asked for and it is the right call for a
	 * control this small: it answers in one tap instead of two, and it has nothing to open,
	 * which is what made the menu awkward.
	 *
	 * Anyone who wants to go back to following their OS can still clear the stored
	 * preference; until first use, "system" is still the default, because mode-watcher only
	 * pins a value once this is pressed.
	 */
	let isDark = $derived(mode.current === 'dark');
</script>

<Button
	variant="ghost"
	size="icon"
	onclick={toggleMode}
	aria-label={m.theme_toggle()}
	aria-pressed={isDark}
	title={isDark ? m.theme_light() : m.theme_dark()}
>
	<!--
		Both glyphs are always mounted and swapped with transform and opacity, so the change
		is a crossfade rather than a layout shift. `layout.css` neutralises the transition
		under prefers-reduced-motion.
	-->
	<Sun class="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
	<Moon
		class="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
	/>
</Button>
