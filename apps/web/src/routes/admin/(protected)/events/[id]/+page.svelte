<script lang="ts">
	import DangerZone from '$lib/components/admin/danger-zone.svelte';
	import EventForm from '$lib/components/admin/EventForm.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Mic from '@lucide/svelte/icons/mic';
	import Users from '@lucide/svelte/icons/users';

	let { data, form } = $props();
	let title = $derived(
		data.event.translations.find((t) => t.locale === 'lo')?.title ?? data.event.slug
	);
</script>

<Seo title="Edit event" noindex />

<PageHeader {title} description="/{data.event.slug}">
	{#snippet actions()}
		<Badge variant={data.event.status === 'published' ? 'secondary' : 'outline'}>
			{data.event.status}
		</Badge>
		{#if data.event.status === 'published'}
			<Button href="/events/{data.event.slug}" target="_blank" variant="ghost" size="sm">
				<ExternalLink data-icon="inline-start" />

<FormAlert {form} />
				View
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<!--
	The three things you do *to* an event, as opposed to editing its copy. They
	sit above the form because on the week of an event they are what you came
	for; the description is already written by then.
-->
<nav class="mt-6 flex flex-wrap gap-2" aria-label="Event sections">
	<Button href="/admin/events/{data.event.id}/lineup" variant="outline" size="sm">
		<Mic data-icon="inline-start" />
		Line-up
	</Button>
	<Button href="/admin/events/{data.event.id}/feedback" variant="outline" size="sm">
		<MessageSquare data-icon="inline-start" />
		Feedback
	</Button>
	<Button href="/admin/events/{data.event.id}/registrations" variant="outline" size="sm">
		<Users data-icon="inline-start" />
		{data.event.registeredCount} registrants
	</Button>
</nav>

<form method="POST" action="?/save" class="mt-8">
	<EventForm event={data.event} />
</form>

<DangerZone
	title="Delete event"
	description="This also deletes {data.event
		.registeredCount} registration(s), along with any tickets already issued."
	confirmTitle="Delete this event?"
	confirmDescription="The event and its {data.event
		.registeredCount} registration(s) are removed for good. Tickets already issued stop working. This cannot be undone."
	confirmLabel="Delete event"
/>
