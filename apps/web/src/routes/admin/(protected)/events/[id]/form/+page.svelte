<script lang="ts">
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import FormBuilder from '$lib/components/admin/FormBuilder.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data, form } = $props();

	let eventTitle = $derived(
		data.event.translations.find((t) => t.locale === 'lo')?.title ?? data.event.slug
	);
</script>

<Seo title="Registration form" noindex />

<PageHeader title="Registration form" description={eventTitle}>
	{#snippet actions()}
		<Button variant="outline" href="/admin/events/{data.event.id}">
			<ArrowLeft data-icon="inline-start" />
			Back to event
		</Button>
	{/snippet}
</PageHeader>

<FormAlert {form} />

<div class="mt-6">
	<FormBuilder blocks={data.blocks} answerCounts={data.answerCounts} result={form} />
</div>
