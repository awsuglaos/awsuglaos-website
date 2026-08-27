<script lang="ts">
	import { enhance } from '$app/forms';
	import { AdminFormState } from '$lib/admin-form.svelte';
	import { COMMUNITY_ROLE_LABEL } from '$lib/community-role';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import UnsavedGuard from '$lib/components/admin/unsaved-guard.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { CommunityRole } from '@awsug/shared';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	let { data, form } = $props();

	const formState = new AdminFormState();

	interface TeamCard {
		id: string;
		name: string;
		slug: string;
		title: string | null;
		company: string | null;
		photoUrl: string | null;
	}

	/*
	 * Four zones rather than a list plus a role dropdown. Where a person sits is
	 * the whole answer — dragging someone from Organiser into Co-leader promotes
	 * them and places them in one gesture, which is how an organiser actually
	 * thinks about it. The role and the position are then one submission, so
	 * neither can land without the other.
	 */
	const ZONES = ['leader', 'co_leader', 'organiser', 'none'] as const;

	const FLIP_MS = 150;

	function toCard(s: (typeof data.speakers)[number]): TeamCard {
		const t = s.translations.find((x) => x.locale === 'lo') ?? s.translations[0];
		return {
			id: s.id,
			name: t?.name ?? s.slug,
			slug: s.slug,
			title: t?.title ?? null,
			company: s.company,
			photoUrl: s.photoUrl
		};
	}

	let zones = $state<Record<CommunityRole, TeamCard[]>>(
		Object.fromEntries(
			ZONES.map((role) => [role, data.speakers.filter((s) => s.communityRole === role).map(toCard)])
		) as Record<CommunityRole, TeamCard[]>
	);

	/* The submitted array is every zone in role order, top to bottom. Its index
	   becomes sort_order, so relative position within each role is preserved. */
	let submitted = $derived(ZONES.flatMap((role) => zones[role].map((card) => ({ role, card }))));

	let teamCount = $derived(submitted.filter((row) => row.role !== 'none').length);

	function onconsider(role: CommunityRole, event: CustomEvent<DndEvent<TeamCard>>) {
		zones[role] = event.detail.items;
	}

	function onfinalize(role: CommunityRole, event: CustomEvent<DndEvent<TeamCard>>) {
		zones[role] = event.detail.items;
		formState.dirty = true;
	}

	/*
	 * The keyboard and touch path. Identical splice to the event line-up editor —
	 * svelte-dnd-action handles its own keyboard dragging, but these also move a
	 * person *between* zones, which a pointer drag does and a keyboard drag
	 * within one zone cannot.
	 */
	function move(role: CommunityRole, index: number, delta: number) {
		const list = zones[role];
		const next = index + delta;

		if (next < 0 || next >= list.length) {
			// Off the end of a zone: step into the neighbouring role instead.
			const zoneIndex = ZONES.indexOf(role);
			const target = ZONES[zoneIndex + delta];
			if (!target) return;

			const copy = [...list];
			const [card] = copy.splice(index, 1);
			zones[role] = copy;
			zones[target] = delta < 0 ? [...zones[target], card!] : [card!, ...zones[target]];
		} else {
			const copy = [...list];
			const [card] = copy.splice(index, 1);
			copy.splice(next, 0, card!);
			zones[role] = copy;
		}

		formState.dirty = true;
	}

	/**
	 * What the button will actually do. At a zone boundary these buttons change
	 * the person's role rather than their position, and "Move Somchai down" would
	 * be a lie about a promotion.
	 */
	function moveLabel(role: CommunityRole, index: number, delta: number, name: string): string {
		const next = index + delta;
		if (next >= 0 && next < zones[role].length) {
			return `Move ${name} ${delta < 0 ? 'up' : 'down'}`;
		}

		const target = ZONES[ZONES.indexOf(role) + delta];
		return target ? `Move ${name} to ${COMMUNITY_ROLE_LABEL[target]}` : `Move ${name}`;
	}
</script>

<Seo title="Team order" noindex />

<PageHeader
	title="Team order"
	description="Drag a person into a role to set it, and up or down to order them. This is the order the landing page and the speaker directory use."
>
	{#snippet actions()}
		<Button href="/admin/speakers" variant="ghost">Back to speakers</Button>
	{/snippet}
</PageHeader>

<FormAlert {form} successMessages={['Order saved.']} />

<form method="POST" bind:this={formState.form} use:enhance={formState.enhance}>
	{#each submitted as row (row.card.id)}
		<input type="hidden" name="id" value={row.card.id} />
		<input type="hidden" name="communityRole" value={row.role} />
	{/each}

	<div class="mt-6 grid gap-5 lg:grid-cols-2">
		{#each ZONES as role (role)}
			<Card.Root class="[--card-spacing:--spacing(5)]">
				<Card.Header>
					<Card.Title class="flex items-baseline gap-2">
						{COMMUNITY_ROLE_LABEL[role]}
						<span class="text-muted-foreground text-sm font-normal tabular-nums">
							{zones[role].length}
						</span>
					</Card.Title>
				</Card.Header>

				<Card.Content>
					<!--
						The empty-state line lives outside the zone on purpose: the library
						maps a zone's child elements to its items by index, so a stray
						placeholder child makes every drop land on the wrong row.
					-->
					<ul
						use:dndzone={{ items: zones[role], flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
						onconsider={(event) => onconsider(role, event)}
						onfinalize={(event) => onfinalize(role, event)}
						aria-label={COMMUNITY_ROLE_LABEL[role]}
						class="border-border/60 grid min-h-24 list-none content-start gap-2 rounded-lg border border-dashed p-2"
					>
						{#each zones[role] as card, index (card.id)}
							<li
								animate:flip={{ duration: FLIP_MS }}
								class="bg-card flex items-center gap-3 rounded-md border p-2 shadow-xs"
								aria-label={card.name}
							>
								<GripVertical class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />

								<Avatar.Root class="size-9 shrink-0">
									{#if card.photoUrl}
										<Avatar.Image src={card.photoUrl} alt="" />
									{/if}
									<Avatar.Fallback class="font-semibold">{card.name.slice(0, 1)}</Avatar.Fallback>
								</Avatar.Root>

								<div class="min-w-0 flex-1">
									<a
										href="/admin/speakers/{card.id}"
										class="block truncate text-sm font-medium hover:underline"
									>
										{card.name}
									</a>
									<span class="text-muted-foreground block truncate text-xs">
										{[card.title, card.company].filter(Boolean).join(' · ') || `/${card.slug}`}
									</span>
								</div>

								<div class="flex shrink-0 items-center">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={moveLabel(role, index, -1, card.name)}
										disabled={role === ZONES[0] && index === 0}
										onclick={() => move(role, index, -1)}
									>
										<ChevronUp />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={moveLabel(role, index, 1, card.name)}
										disabled={role === ZONES[ZONES.length - 1] && index === zones[role].length - 1}
										onclick={() => move(role, index, 1)}
									>
										<ChevronDown />
									</Button>
								</div>
							</li>
						{/each}
					</ul>

					{#if zones[role].length === 0}
						<p class="text-muted-foreground mt-2 px-1 text-center text-sm">
							{role === 'none' ? 'Everyone is on the team.' : 'Drop someone here.'}
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<div
		class="bg-background/85 sticky bottom-0 -mx-4 mt-6 flex items-center gap-3 border-t px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
	>
		<Button type="submit" disabled={formState.submitting}>
			{#if formState.submitting}<Spinner data-icon="inline-start" />{/if}
			{formState.submitting ? 'Saving…' : 'Save order'}
		</Button>

		<span class="text-muted-foreground text-xs">
			{teamCount}
			{teamCount === 1 ? 'person' : 'people'} on the team
		</span>

		{#if formState.dirty && !formState.submitting}
			<span class="text-muted-foreground ml-auto text-xs">Unsaved changes</span>
		{/if}
	</div>
</form>

<UnsavedGuard dirty={formState.dirty} />
