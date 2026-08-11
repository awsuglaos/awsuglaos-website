<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		/**
		 * `mark` is the stupa hexagon on its own — it needs a text wordmark beside
		 * it. `lockup` already contains "aws User Group Laos", so it stands alone
		 * and must not be paired with the name again.
		 */
		variant?: 'mark' | 'lockup';
		class?: string;
		/**
		 * Decorative by default: in the header the mark sits next to live text
		 * that already names the group, so describing it again is noise for a
		 * screen reader. Pass `alt` where the logo is the only naming element.
		 */
		alt?: string;
		/** The header logo is above the fold; everything else can wait. */
		eager?: boolean;
	}

	let { variant = 'mark', class: className, alt = '', eager = false }: Props = $props();
</script>

<!--
	`enhanced:img` needs a literal src at build time, so the two variants are two
	elements rather than one dynamic path. The `?w=` list caps what gets emitted:
	without it the 1254px source would ship a 1254px variant nothing renders at.

	The artwork is a transparent PNG with an opaque dark-navy hexagon, which
	reads correctly on both light and dark paper — no per-theme swap needed.
-->
{#if variant === 'lockup'}
	<enhanced:img
		src="$lib/assets/awsuglaos-lockup.png?w=320;160;80"
		{alt}
		aria-hidden={alt === '' ? 'true' : undefined}
		loading={eager ? 'eager' : 'lazy'}
		fetchpriority={eager ? 'high' : undefined}
		decoding="async"
		class={cn('h-auto w-full object-contain', className)}
	/>
{:else}
	<enhanced:img
		src="$lib/assets/awsuglaos-mark.png?w=128;96;64;32"
		{alt}
		aria-hidden={alt === '' ? 'true' : undefined}
		loading={eager ? 'eager' : 'lazy'}
		fetchpriority={eager ? 'high' : undefined}
		decoding="async"
		class={cn('h-auto w-full object-contain', className)}
	/>
{/if}
