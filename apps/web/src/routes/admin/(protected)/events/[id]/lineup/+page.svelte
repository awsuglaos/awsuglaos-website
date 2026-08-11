<script lang="ts">
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Handshake from '@lucide/svelte/icons/handshake';
	import Mic from '@lucide/svelte/icons/mic';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data, form } = $props();

	let eventTitle = $derived(
		data.event.translations.find((t) => t.locale === 'lo')?.title ?? data.event.slug
	);

	function speakerName(id: string): string {
		const speaker = data.allSpeakers.find((s) => s.id === id);
		return speaker?.translations.find((t) => t.locale === 'lo')?.name ?? speaker?.slug ?? id;
	}

	/* ---- speaker line-up ---------------------------------------------- */

	interface LineupRow {
		speakerId: string;
		talkTitleLo: string;
		abstractLo: string;
		talkTitleEn: string;
		abstractEn: string;
	}

	let lineup = $state<LineupRow[]>(
		data.speakersLo.map((s) => {
			const en = data.speakersEn.find((e) => e.id === s.id);
			return {
				speakerId: s.speakerId,
				talkTitleLo: s.talkTitle ?? '',
				abstractLo: s.abstract ?? '',
				talkTitleEn: en?.talkTitle ?? '',
				abstractEn: en?.abstract ?? ''
			};
		})
	);

	let speakerToAdd = $state('');

	let availableSpeakers = $derived(
		data.allSpeakers.filter((s) => !lineup.some((row) => row.speakerId === s.id))
	);

	function addSpeaker() {
		if (!speakerToAdd) return;
		lineup = [
			...lineup,
			{ speakerId: speakerToAdd, talkTitleLo: '', abstractLo: '', talkTitleEn: '', abstractEn: '' }
		];
		speakerToAdd = '';
	}

	function move(index: number, delta: number) {
		const next = index + delta;
		if (next < 0 || next >= lineup.length) return;
		const copy = [...lineup];
		const [row] = copy.splice(index, 1);
		copy.splice(next, 0, row!);
		lineup = copy;
	}

	/* ---- sponsors ------------------------------------------------------ */

	interface SponsorRow {
		sponsorId: string;
		tier: 'platinum' | 'gold' | 'silver' | 'community';
	}

	let eventSponsors = $state<SponsorRow[]>(
		data.eventSponsors.map((s) => ({ sponsorId: s.sponsorId, tier: s.tier }))
	);
	let sponsorToAdd = $state('');

	let availableSponsors = $derived(
		data.allSponsors.filter((s) => !eventSponsors.some((row) => row.sponsorId === s.id))
	);

	function addSponsor() {
		if (!sponsorToAdd) return;
		const sponsor = data.allSponsors.find((s) => s.id === sponsorToAdd);
		// Default to the sponsor's group-wide tier; the editor can override it for
		// this event without touching their standing elsewhere.
		eventSponsors = [
			...eventSponsors,
			{ sponsorId: sponsorToAdd, tier: sponsor?.tier ?? 'community' }
		];
		sponsorToAdd = '';
	}

	function sponsorName(id: string): string {
		return data.allSponsors.find((s) => s.id === id)?.name ?? id;
	}
	function globalTier(id: string): string {
		return data.allSponsors.find((s) => s.id === id)?.tier ?? '';
	}

	const tiers = ['platinum', 'gold', 'silver', 'community'] as const;
</script>

<Seo title="Line-up" noindex />

<PageHeader title="Line-up" description={eventTitle}>
	{#snippet actions()}
		<Button href="/admin/events/{data.event.id}" variant="ghost" size="sm">
			<ArrowLeft data-icon="inline-start" />

<FormAlert {form} successMessages={['Saved.', 'Line-up saved.', 'Sponsors saved.']} />
			Back to event
		</Button>
	{/snippet}
</PageHeader>

<!-- Speakers -->
<form method="POST" action="?/speakers" class="mt-8">
	<h2 class="text-lg font-semibold tracking-tight">Speakers</h2>
	<p class="text-muted-foreground mt-1 text-sm">
		Order here is the order they appear on the event page.
	</p>

	<div class="mt-4 flex flex-col gap-4">
		{#each lineup as row, index (row.speakerId)}
			<Card.Root class="[--card-spacing:--spacing(5)]">
				<Card.Header class="flex flex-row items-center justify-between gap-3">
					<Card.Title class="flex min-w-0 items-center gap-2">
						<!--
							The position is the point of this screen, so it is stated as a
							number rather than left implicit in the stacking order.
						-->
						<span
							class="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold tabular-nums"
							aria-hidden="true">{index + 1}</span
						>
						<span class="truncate">{speakerName(row.speakerId)}</span>
					</Card.Title>

					<div class="flex shrink-0 items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={index === 0}
							aria-label="Move {speakerName(row.speakerId)} up"
							onclick={() => move(index, -1)}
						>
							<ChevronUp />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={index === lineup.length - 1}
							aria-label="Move {speakerName(row.speakerId)} down"
							onclick={() => move(index, 1)}
						>
							<ChevronDown />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Remove {speakerName(row.speakerId)}"
							onclick={() => (lineup = lineup.filter((_, i) => i !== index))}
						>
							<Trash2 />
						</Button>
					</div>
				</Card.Header>

				<Card.Content>
					<input type="hidden" name="speakerId" value={row.speakerId} />

					<Field.FieldGroup>
						<div class="grid gap-5 sm:grid-cols-2">
							<Field.Field>
								<Field.FieldLabel for="talk_lo_{index}">Talk title (Lao)</Field.FieldLabel>
								<Input
									id="talk_lo_{index}"
									name="talkTitle_lo"
									lang="lo"
									bind:value={row.talkTitleLo}
								/>
							</Field.Field>

							<Field.Field>
								<Field.FieldLabel for="talk_en_{index}">Talk title (English)</Field.FieldLabel>
								<Input
									id="talk_en_{index}"
									name="talkTitle_en"
									lang="en"
									bind:value={row.talkTitleEn}
								/>
							</Field.Field>

							<Field.Field>
								<Field.FieldLabel for="abstract_lo_{index}">Abstract (Lao)</Field.FieldLabel>
								<Textarea
									id="abstract_lo_{index}"
									name="abstract_lo"
									lang="lo"
									rows={2}
									bind:value={row.abstractLo}
								/>
							</Field.Field>

							<Field.Field>
								<Field.FieldLabel for="abstract_en_{index}">Abstract (English)</Field.FieldLabel>
								<Textarea
									id="abstract_en_{index}"
									name="abstract_en"
									lang="en"
									rows={2}
									bind:value={row.abstractEn}
								/>
							</Field.Field>
						</div>
					</Field.FieldGroup>
				</Card.Content>
			</Card.Root>
		{:else}
			<Empty.Root class="border">
				<Empty.Header>
					<Empty.Media variant="icon"><Mic /></Empty.Media>
					<Empty.Description>No speakers on this event yet.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/each}
	</div>

	<div class="mt-5 flex flex-wrap items-end gap-3">
		<div class="min-w-56 flex-1">
			<Label for="addSpeaker">Add a speaker</Label>
			<select id="addSpeaker" bind:value={speakerToAdd} class="native-select mt-1.5">
				<option value="">Choose…</option>
				{#each availableSpeakers as speaker (speaker.id)}
					<option value={speaker.id}>{speakerName(speaker.id)}</option>
				{/each}
			</select>
		</div>
		<Button type="button" variant="outline" onclick={addSpeaker} disabled={!speakerToAdd}>
			<Plus data-icon="inline-start" />
			Add
		</Button>
		<span class="flex-1"></span>
		<Button type="submit">Save line-up</Button>
	</div>

	<p class="text-muted-foreground mt-3 text-xs">
		Need a new profile?
		<a href="/admin/speakers/new" class="underline underline-offset-4">Create a speaker</a> first.
	</p>
</form>

<!-- Sponsors -->
<form method="POST" action="?/sponsors" class="mt-14">
	<h2 class="text-lg font-semibold tracking-tight">Sponsors of this event</h2>
	<p class="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
		Tier applies to this event only — it does not change the sponsor's standing on the landing
		page.
	</p>

	<Card.Root class="mt-4 [--card-spacing:--spacing(5)]">
		<Card.Content class="flex flex-col gap-3">
			{#each eventSponsors as row, index (row.sponsorId)}
				<div class="flex flex-wrap items-end gap-3">
					<input type="hidden" name="sponsorId" value={row.sponsorId} />

					<div class="min-w-40 flex-1">
						<span class="text-sm font-medium">{sponsorName(row.sponsorId)}</span>
						<span class="text-muted-foreground block text-xs">
							group-wide: {globalTier(row.sponsorId)}
						</span>
					</div>

					<div>
						<Label for="tier_{index}" class="sr-only">Tier for this event</Label>
						<select
							id="tier_{index}"
							name="sponsorTier"
							bind:value={row.tier}
							class="native-select w-auto"
						>
							{#each tiers as tier (tier)}
								<option value={tier}>{tier}</option>
							{/each}
						</select>
					</div>

					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Remove {sponsorName(row.sponsorId)}"
						onclick={() => (eventSponsors = eventSponsors.filter((_, i) => i !== index))}
					>
						<Trash2 />
					</Button>
				</div>
			{:else}
				<Empty.Root class="py-4">
					<Empty.Header>
						<Empty.Media variant="icon"><Handshake /></Empty.Media>
						<Empty.Description>No sponsors on this event yet.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/each}
		</Card.Content>
	</Card.Root>

	<div class="mt-5 flex flex-wrap items-end gap-3">
		<div class="min-w-56 flex-1">
			<Label for="addSponsor">Add a sponsor</Label>
			<select id="addSponsor" bind:value={sponsorToAdd} class="native-select mt-1.5">
				<option value="">Choose…</option>
				{#each availableSponsors as sponsor (sponsor.id)}
					<option value={sponsor.id}>{sponsor.name} ({sponsor.tier})</option>
				{/each}
			</select>
		</div>
		<Button type="button" variant="outline" onclick={addSponsor} disabled={!sponsorToAdd}>
			<Plus data-icon="inline-start" />
			Add
		</Button>
		<span class="flex-1"></span>
		<Button type="submit">Save sponsors</Button>
	</div>
</form>
