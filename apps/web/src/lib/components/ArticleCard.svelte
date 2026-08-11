<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { formatDate, isoDate } from '$lib/format';
	import { localizeHref } from '$lib/paraglide/runtime';

	interface Props {
		article: {
			slug: string;
			title: string;
			excerpt: string | null;
			category: string | null;
			coverImageUrl: string | null;
			publishedAt: Date | null;
		};
	}

	let { article }: Props = $props();
</script>

<Card.Root class="lift group relative h-full hover:ring-foreground/20">
	{#if article.coverImageUrl}
		<img
			src={article.coverImageUrl}
			alt=""
			loading="lazy"
			decoding="async"
			class="aspect-1200/630 w-full object-cover"
		/>
	{/if}

	<Card.Header class="gap-2">
		{#if article.category}
			<Badge variant="secondary" class="w-fit">{article.category}</Badge>
		{/if}

		<Card.Title class="text-lg tracking-tight">
			<a
				href={localizeHref(`/news/${article.slug}`)}
				class="group-hover:text-primary transition-colors after:absolute after:inset-0 after:content-['']"
			>
				{article.title}
			</a>
		</Card.Title>

		{#if article.excerpt}
			<Card.Description class="line-clamp-3">{article.excerpt}</Card.Description>
		{/if}
	</Card.Header>

	{#if article.publishedAt}
		<Card.Content class="text-muted-foreground mt-auto pt-1 text-xs">
			<time datetime={isoDate(article.publishedAt)}>{formatDate(article.publishedAt)}</time>
		</Card.Content>
	{/if}
</Card.Root>
