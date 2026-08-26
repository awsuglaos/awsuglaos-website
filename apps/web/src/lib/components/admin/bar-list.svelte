<script lang="ts">
	interface Row {
		label: string;
		count: number;
		percent: number;
	}

	interface Props {
		rows: Row[];
		/** Names the single series, so no legend box is needed. */
		caption: string;
		/** What the percentage is a share of, for the accessible table. */
		unit?: string;
	}

	let { rows, caption, unit = 'of those who answered' }: Props = $props();

	// The longest bar sets the scale, so a question where nothing broke 20% still
	// shows its shape rather than four near-invisible slivers.
	let peak = $derived(Math.max(1, ...rows.map((row) => row.count)));
</script>

<!--
	One series, so no legend: the caption above names what these bars are. Values
	are direct-labelled at the end of each row rather than hovering behind a
	tooltip, because there are few enough rows to label them all and a number an
	organiser has to hunt for is a number they will not read.

	Text stays in the text tokens; only the bar carries the accent.
-->
<div class="flex flex-col gap-2.5">
	{#each rows as row (row.label)}
		<div class="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
			<span class="text-foreground truncate text-sm" title={row.label}>{row.label}</span>

			<div class="bg-muted h-2.5 overflow-hidden rounded-full">
				<div
					class="bg-primary h-full rounded-full transition-[width] duration-500"
					style="width: {(row.count / peak) * 100}%"
				></div>
			</div>

			<span class="text-muted-foreground w-20 text-right font-mono text-xs tabular-nums">
				{row.count} · {row.percent}%
			</span>
		</div>
	{/each}
</div>

<!-- The same numbers as a table, for screen readers and for copying out. -->
<table class="sr-only">
	<caption>{caption} — counts and share {unit}</caption>
	<thead>
		<tr><th scope="col">Option</th><th scope="col">Count</th><th scope="col">Share</th></tr>
	</thead>
	<tbody>
		{#each rows as row (row.label)}
			<tr>
				<th scope="row">{row.label}</th>
				<td>{row.count}</td>
				<td>{row.percent}%</td>
			</tr>
		{/each}
	</tbody>
</table>
