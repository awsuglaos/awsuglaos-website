<script lang="ts">
	import DangerZone from '$lib/components/admin/danger-zone.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import SpeakerForm from '$lib/components/admin/SpeakerForm.svelte';
	import Seo from '$lib/components/Seo.svelte';

	let { data, form } = $props();
	let name = $derived(
		data.speaker.translations.find((t) => t.locale === 'lo')?.name ?? data.speaker.slug
	);
</script>

<Seo title="Edit speaker" noindex />

<PageHeader title={name} description="/{data.speaker.slug}" />

<FormAlert {form} />

<div class="mt-8">
	<SpeakerForm speaker={data.speaker} result={form} action="?/save" />
</div>

<DangerZone
	title="Delete speaker"
	description="Removes them from every event they appear on. The events themselves are unaffected."
	confirmTitle="Delete {name}?"
	confirmDescription="They are removed from every event line-up they appear on. This cannot be undone."
	confirmLabel="Delete speaker"
/>
