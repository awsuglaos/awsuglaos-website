<script lang="ts">
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Table from '$lib/components/ui/table';
	import { formatDate } from '$lib/format';
	import Newspaper from '@lucide/svelte/icons/newspaper';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	function title(a: (typeof data.articles)[number]): string {
		return a.translations.find((t) => t.locale === 'lo')?.title ?? a.slug;
	}

	// A missing English translation is the common editorial gap — surface it in
	// the list so it can be spotted without opening each post.
	function hasEnglish(a: (typeof data.articles)[number]): boolean {
		return a.translations.some((t) => t.locale === 'en');
	}
</script>

<Seo title="News" noindex />

<PageHeader title="News">
	{#snippet actions()}
		<Button href="/admin/articles/new">
			<Plus data-icon="inline-start" />
			New article
		</Button>
	{/snippet}
</PageHeader>

<Card.Root class="mt-6 [--card-spacing:--spacing(0)]">
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Title</Table.Head>
					<Table.Head>Category</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head>Languages</Table.Head>
					<Table.Head>Published</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.articles as article (article.id)}
					<Table.Row>
						<Table.Cell class="font-medium">
							<a href="/admin/articles/{article.id}" class="hover:underline">{title(article)}</a>
							<span class="text-muted-foreground block text-xs">/{article.slug}</span>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{article.category ?? '—'}</Table.Cell>
						<Table.Cell>
							<Badge variant={article.status === 'published' ? 'secondary' : 'outline'}>
								{article.status}
							</Badge>
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							<span class="text-xs">ລາວ</span>
							{#if hasEnglish(article)}
								<span class="text-xs"> · EN</span>
							{:else}
								<span class="text-muted-foreground text-xs"> · no EN</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground whitespace-nowrap">
							{article.publishedAt ? formatDate(new Date(article.publishedAt)) : '—'}
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button href="/admin/articles/{article.id}" variant="ghost" size="sm">Edit</Button>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={6}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><Newspaper /></Empty.Media>
									<Empty.Description>No articles yet.</Empty.Description>
								</Empty.Header>
								<Empty.Content>
									<Button href="/admin/articles/new" variant="outline" size="sm">
										<Plus data-icon="inline-start" />
										New article
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
