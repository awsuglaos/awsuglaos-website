<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		/** Number of venues currently plotted. */
		nodes: number;
		/** Highest sampled elevation in the modelled area, in metres. */
		peak?: number;
		/** Coordinates of the point the chart is centred on. */
		lat: number;
		lng: number;
	}

	let { nodes, peak, lat, lng }: Props = $props();

	const coordinate = (value: number, positive: string, negative: string) =>
		`${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
</script>

<!--
	Corner readouts in the chart's own annotation register.

	Every value here is a fact this site actually holds: the coordinates the map is centred
	on, how many venues are plotted, the terrain's real peak, and where the data came from.
	The obvious temptation in this visual language is a line like "REGION ap-southeast-1" —
	it would look right and it would be a claim about infrastructure this community has never
	made, so it is not here.
-->
<div
	class="text-muted-foreground/80 absolute inset-0 p-4 font-mono text-[0.625rem] tracking-[0.16em] uppercase sm:p-6"
>
	<div class="absolute top-4 left-4 flex flex-col gap-1 sm:top-6 sm:left-6">
		<span>{coordinate(lat, 'N', 'S')} · {coordinate(lng, 'E', 'W')}</span>
		{#if peak}
			<span class="hidden sm:inline">{m.map_hud_peak({ metres: String(peak) })}</span>
		{/if}
	</div>

	<!--
		No data-source line here. The attribution belongs in exactly two places — the figure's
		own caption and the footer — and repeating it inside the frame only put the same long
		string on top of the map it was crediting.
	-->
	<div class="absolute right-4 bottom-4 flex flex-col items-end gap-1 sm:right-6 sm:bottom-6">
		<span>{m.map_hud_nodes({ count: nodes })}</span>
	</div>
</div>
