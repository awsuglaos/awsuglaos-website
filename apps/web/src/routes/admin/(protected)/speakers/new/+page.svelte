<script lang="ts">
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import SpeakerForm from '$lib/components/admin/SpeakerForm.svelte';
	import Seo from '$lib/components/Seo.svelte';

	let { form } = $props();
</script>

<Seo title="New speaker" noindex />

<PageHeader
	title="New speaker"
	description="Write the profile once — it can then be attached to any event's line-up."
/>

<FormAlert {form} />

<div class="mt-8">
	<SpeakerForm result={form} submitLabel="Create speaker" />
</div>
