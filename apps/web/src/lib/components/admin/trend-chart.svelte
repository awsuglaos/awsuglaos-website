<script lang="ts">
	interface Point {
		date: string;
		count: number;
		cumulative: number;
	}

	interface Props {
		points: Point[];
		caption: string;
	}

	let { points, caption }: Props = $props();

	let peak = $derived(Math.max(1, ...points.map((p) => p.count)));

	/** Which bar the pointer is on. Null when it is on none. */
	let active = $state<number | null>(null);

	const shortDate = (iso: string): string => {
		const [, month, day] = iso.split('-');
		return `${day}/${month}`;
	};

	/*
	 * A label under every bar becomes an unreadable smear once a campaign runs
	 * past a fortnight, so only the ends and a few evenly spaced days are drawn.
	 * The exact date of any bar is a hover away, and the table below has them all.
	 */
	let labelEvery = $derived(Math.max(1, Math.ceil(points.length / 8)));
</script>

<div class="relative">
	<div
		class="flex h-40 items-end gap-[2px]"
		role="group"
		aria-label={caption}
		onmouseleave={() => (active = null)}
	>
		{#each points as point, index (point.date)}
			<!--
				Each bar is its own hit target, wider than the mark it draws, so a
				one-registration day on a two-month chart is still hoverable.
			-->
			<div
				class="group relative flex h-full flex-1 items-end justify-center"
				onmouseenter={() => (active = index)}
				onfocusin={() => (active = index)}
				role="presentation"
			>
				<div
					class="w-full rounded-t-[4px] transition-colors {active === index
						? 'bg-primary'
						: 'bg-primary/70'}"
					style="height: {point.count === 0 ? 2 : Math.max(4, (point.count / peak) * 100)}%"
				></div>
			</div>
		{/each}
	</div>

	<div class="text-muted-foreground mt-2 flex gap-[2px] font-mono text-[0.625rem]">
		{#each points as point, index (point.date)}
			<span class="flex-1 truncate text-center">
				{index % labelEvery === 0 || index === points.length - 1 ? shortDate(point.date) : ''}
			</span>
		{/each}
	</div>

	{#if active !== null && points[active]}
		{@const point = points[active]}
		<div
			class="border-border bg-popover text-popover-foreground pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-lg border px-3 py-1.5 text-xs shadow-md"
			role="status"
		>
			<span class="font-medium">{point.date}</span>
			<span class="text-muted-foreground">
				· {point.count} registered · {point.cumulative} total
			</span>
		</div>
	{/if}
</div>

<table class="sr-only">
	<caption>{caption}</caption>
	<thead>
		<tr>
			<th scope="col">Date</th><th scope="col">Registrations</th><th scope="col">Running total</th>
		</tr>
	</thead>
	<tbody>
		{#each points as point (point.date)}
			<tr>
				<th scope="row">{point.date}</th>
				<td>{point.count}</td>
				<td>{point.cumulative}</td>
			</tr>
		{/each}
	</tbody>
</table>
