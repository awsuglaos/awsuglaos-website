<script lang="ts">
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Table from '$lib/components/ui/table';
	import Mic from '@lucide/svelte/icons/mic';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	function name(s: (typeof data.speakers)[number]): string {
		return s.translations.find((t) => t.locale === 'lo')?.name ?? s.slug;
	}
	function role(s: (typeof data.speakers)[number]): string {
		return s.translations.find((t) => t.locale === 'lo')?.title ?? '';
	}
</script>

<Seo title="Speakers" noindex />

<PageHeader
	title="Speakers"
	description="Profiles are reusable — attach a speaker to an event from that event's line-up page, and their bio is written once."
>
	{#snippet actions()}
		<Button href="/admin/speakers/new">
			<Plus data-icon="inline-start" />
			New speaker
		</Button>
	{/snippet}
</PageHeader>

<Card.Root class="mt-6 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16"></Table.Head>
					<Table.Head>Name</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head>Company</Table.Head>
					<Table.Head>Languages</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.speakers as speaker (speaker.id)}
					<Table.Row>
						<Table.Cell>
							<Avatar.Root class="size-10">
								{#if speaker.photoUrl}
									<Avatar.Image src={speaker.photoUrl} alt="" />
								{/if}
								<Avatar.Fallback class="font-semibold">{name(speaker).slice(0, 1)}</Avatar.Fallback
								>
							</Avatar.Root>
						</Table.Cell>
						<Table.Cell class="font-medium">
							<a href="/admin/speakers/{speaker.id}" class="hover:underline">{name(speaker)}</a>
							<span class="text-muted-foreground block text-xs">/{speaker.slug}</span>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{role(speaker) || '—'}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{speaker.company ?? '—'}</Table.Cell>
						<Table.Cell class="text-xs whitespace-nowrap">
							ລາວ{#if speaker.translations.some((t) => t.locale === 'en')} · EN{:else}
								<span class="text-muted-foreground"> · no EN</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button href="/admin/speakers/{speaker.id}" variant="ghost" size="sm">Edit</Button>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={6}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><Mic /></Empty.Media>
									<Empty.Description>No speakers yet.</Empty.Description>
								</Empty.Header>
								<Empty.Content>
									<Button href="/admin/speakers/new" variant="outline" size="sm">
										<Plus data-icon="inline-start" />
										New speaker
									</Button>
								</Empty.Content>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Card.Root>
