<script lang="ts">
	import ArticleForm from '$lib/components/admin/ArticleForm.svelte';
	import DangerZone from '$lib/components/admin/danger-zone.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let { data, form } = $props();
	let title = $derived(
		data.article.translations.find((t) => t.locale === 'lo')?.title ?? data.article.slug
	);
</script>

<Seo title="Edit article" noindex />

<PageHeader {title} description="/{data.article.slug}">
	{#snippet actions()}
		<Badge variant={data.article.status === 'published' ? 'secondary' : 'outline'}>
			{data.article.status}
		</Badge>
		{#if data.article.status === 'published'}
			<Button href="/news/{data.article.slug}" target="_blank" variant="outline" size="sm">
				<ExternalLink data-icon="inline-start" />

<FormAlert {form} />
				View
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<form method="POST" action="?/save" class="mt-8">
	<ArticleForm article={data.article} />
</form>

<DangerZone
	title="Delete article"
	description="Removes the post and both translations. If it is published, the public URL starts returning 404 immediately."
	confirmTitle="Delete this article?"
	confirmDescription="The post and both its translations are removed for good. This cannot be undone."
	confirmLabel="Delete article"
/>
