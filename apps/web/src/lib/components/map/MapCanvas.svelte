<script lang="ts">
	import { detectQuality, prefersReducedMotion, supportsWebGL } from '$lib/map/capabilities';
	import type { MapBeacon, MapLabel, MapScene, MapView } from '$lib/map/scene';
	import { currentLocale } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';

	interface Props {
		view: MapView;
		/** Real event venues. Anything outside the modelled area is dropped by the scene. */
		beacons?: MapBeacon[];
		activeId?: string | null;
		focus?: { lat: number; lng: number } | null;
		/** Sentence describing the map, for anyone who cannot see it. */
		label: string;
		class?: string;
		/** Corner readouts. Only ever real facts — see MapHud. */
		hud?: import('svelte').Snippet;
		onSelect?: (id: string) => void;
		onHover?: (id: string | null) => void;
	}

	let {
		view,
		beacons = [],
		activeId = null,
		focus = null,
		label,
		class: className = '',
		hud,
		onSelect,
		onHover
	}: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);
	let scene = $state<MapScene | null>(null);
	let ready = $state(false);
	let labels = $state<MapLabel[]>([]);

	/*
	 * Decided once on mount rather than during render, because both probes touch the DOM and
	 * would throw during server rendering. `capable` gates the canvas out of the markup
	 * entirely, so a browser without WebGL2 never creates the element — and, more to the
	 * point, never downloads three.js.
	 */
	let capable = $state(false);
	let reducedMotion = false;
	let quality: 'full' | 'lite' = 'full';

	onMount(() => {
		reducedMotion = prefersReducedMotion();
		quality = detectQuality();
		capable = supportsWebGL();
	});

	/*
	 * Runs once the canvas element exists. The poster underneath is the real experience for
	 * anyone this fails for — it is not a spinner — so every failure path stops quietly and
	 * leaves the still image in place rather than showing an error.
	 */
	$effect(() => {
		const element = canvas;
		const host = container;
		if (!element || !host) return;

		let cancelled = false;
		let instance: MapScene | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let themeObserver: MutationObserver | null = null;
		let visibility: IntersectionObserver | null = null;

		const onVisibility = () => instance?.setRunning(!document.hidden);

		function teardown() {
			cancelled = true;
			ready = false;
			scene = null;
			labels = [];
			document.removeEventListener('visibilitychange', onVisibility);
			resizeObserver?.disconnect();
			themeObserver?.disconnect();
			visibility?.disconnect();
			instance?.dispose();
			instance = null;
		}

		function onContextLost(event: Event) {
			// Preventing the default allows a restore; without a restore handler we fall back
			// to the poster rather than leaving a dead black rectangle.
			event.preventDefault();
			teardown();
		}

		element.addEventListener('webglcontextlost', onContextLost);

		void (async () => {
			const [{ createMapScene }, { decodeCity, decodeCountry }] = await Promise.all([
				import('$lib/map/scene'),
				import('$lib/map/decode')
			]);
			if (cancelled) return;

			instance = createMapScene(element, {
				view,
				quality,
				reducedMotion,
				onBeaconSelect: (id) => onSelect?.(id),
				onBeaconHover: (id) => onHover?.(id),
				onLabels: (next) => {
					// A new array each frame would thrash Svelte's reactivity; the scene reuses
					// its buffer, so copy only what the overlay renders.
					labels = next.map((l) => ({ ...l }));
				}
			});

			try {
				const url = view === 'country' ? '/laos-terrain.bin' : '/vientiane-streets.bin';
				const response = await fetch(url);
				if (!response.ok) throw new Error(`${url} ${response.status}`);
				const buffer = await response.arrayBuffer();
				if (cancelled || !instance) return;

				if (view === 'country') instance.loadCountry(decodeCountry(buffer));
				else instance.loadCity(decodeCity(buffer));

				instance.setBeacons(beacons);
				// Already looking at the venue on the first frame — a locator that flies in
				// from the city centre is animation for its own sake.
				if (focus) instance.focus(focus.lat, focus.lng, true);
				scene = instance;
				ready = true;
			} catch (error) {
				/*
				 * Falling back to the poster is right for a visitor, but a silent fallback is
				 * wrong for a maintainer: without this line a missing or corrupt map file looks
				 * identical to a slow one.
				 */
				console.warn('[map] unavailable, using the poster:', error);
				teardown();
				return;
			}

			resizeObserver = new ResizeObserver(() => instance?.resize());
			resizeObserver.observe(host);

			// mode-watcher toggles `.dark` on <html>; the scene re-reads the tokens rather
			// than keeping its own light and dark palettes.
			themeObserver = new MutationObserver(() => instance?.refreshPalette());
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			});

			// Nothing renders while the map is off-screen or the tab is in the background.
			visibility = new IntersectionObserver(
				([entry]) => instance?.setRunning(entry.isIntersecting && !document.hidden),
				{ rootMargin: '120px' }
			);
			visibility.observe(host);

			document.addEventListener('visibilitychange', onVisibility);
		})();

		return () => {
			element.removeEventListener('webglcontextlost', onContextLost);
			teardown();
		};
	});

	$effect(() => {
		scene?.setBeacons(beacons);
	});

	$effect(() => {
		scene?.setActive(activeId);
	});

	$effect(() => {
		if (focus) scene?.focus(focus.lat, focus.lng);
	});

	let lao = $derived(currentLocale() === 'lo');
</script>

<!--
	The still image is always in the document and the canvas layers over it once the chart is
	drawn. That ordering is deliberate: the poster is server-rendered, so the frame is never
	empty and the largest paint never waits on WebGL or a fetch.

	There are two of them, one per theme, rather than one picture element switched by
	prefers-color-scheme: this project's theme is a `.dark` class set by mode-watcher before
	first paint, so a media query would show the wrong poster to anyone whose chosen theme
	differs from their operating system's.
-->
<div
	bind:this={container}
	class="bg-muted/40 relative isolate overflow-hidden {className}"
	role="img"
	aria-label={label}
	data-map-view={view}
	data-map-ready={ready ? 'true' : 'false'}
>
	<img
		src="/map-poster-light.webp"
		alt=""
		class="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 dark:hidden"
		class:opacity-0={ready}
		fetchpriority={view === 'country' ? 'high' : undefined}
		decoding="async"
	/>
	<img
		src="/map-poster-dark.webp"
		alt=""
		class="absolute inset-0 hidden h-full w-full object-cover transition-opacity duration-700 dark:block"
		class:opacity-0={ready}
		fetchpriority={view === 'country' ? 'high' : undefined}
		decoding="async"
	/>

	{#if capable}
		<canvas bind:this={canvas} class="absolute inset-0 block h-full w-full"></canvas>
	{/if}

	<!--
		Labels are HTML positioned from the scene's own projection, not 3D text. Type stays
		crisp at any pixel ratio, inherits Inter and Noto Sans Lao, and can carry a real
		accessible name — none of which a texture-atlas label can do.
	-->
	{#if ready}
		<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			{#each labels as item (item.id)}
				{#if item.visible}
					<span
						class="map-label absolute -translate-x-1/2 -translate-y-full pb-1.5 font-mono whitespace-nowrap uppercase transition-opacity duration-200
							{item.kind === 'hub' || item.kind === 'venue'
							? 'text-foreground text-[0.6875rem] font-semibold tracking-[0.16em]'
							: 'text-muted-foreground text-[0.625rem] tracking-[0.14em]'}"
						style="left: {item.x}px; top: {item.y}px"
					>
						{lao && item.textLo ? item.textLo : item.text}
					</span>
				{/if}
			{/each}
		</div>
	{/if}

	{#if hud}
		<div class="pointer-events-none absolute inset-0">{@render hud()}</div>
	{/if}

	<span class="sr-only">{m.map_source()}</span>
</div>

<style>
	/*
	 * A halo behind every place name.
	 *
	 * This is what cartographers do and it is not decoration: contour line-work is dense
	 * exactly where the mountains — and therefore the towns — are, so unhaloed labels sit on
	 * top of their own busiest background and stop being readable. The halo is the page's
	 * own background colour, so it follows the theme with everything else.
	 */
	.map-label {
		text-shadow:
			0 0 3px var(--background),
			0 0 3px var(--background),
			0 0 7px var(--background);
	}
</style>
