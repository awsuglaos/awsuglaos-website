<script lang="ts">
	import EventForm from '$lib/components/admin/EventForm.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';

	let { form } = $props();
</script>

<Seo title="New event" noindex />

<PageHeader
	title="New event"
	description="Create it as a draft, then add the line-up and sponsors before publishing."
/>

<FormAlert {form} />

<div class="mt-8">
	<EventForm result={form} submitLabel="Create event" />
</div>
