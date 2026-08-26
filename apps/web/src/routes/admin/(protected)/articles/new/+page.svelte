<script lang="ts">
	import ArticleForm from '$lib/components/admin/ArticleForm.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';

	let { form } = $props();
</script>

<Seo title="New article" noindex />

<PageHeader title="New article" description="Lao is required; English can follow later." />

<FormAlert {form} />

<div class="mt-8">
	<ArticleForm result={form} submitLabel="Create article" />
</div>
