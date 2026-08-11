<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { formatDate, isoDate } from '$lib/format';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data } = $props();
	let article = $derived(data.article);
</script>

<Seo
	title={article.title}
	description={article.excerpt ?? article.contentText.slice(0, 160)}
	image={article.coverImageUrl}
	type="article"
	publishedAt={article.publishedAt}
/>

<article class="mx-auto max-w-2xl px-4 py-10 sm:py-14">
	<a
		href={localizeHref('/news')}
		class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
	>
		<ArrowLeft class="size-4" aria-hidden="true" />
		{m.news_back()}
	</a>

	{#if article.translationFallback}
		<Alert class="mt-6">
			<AlertDescription>{m.translation_fallback()}</AlertDescription>
		</Alert>
	{/if}

	<!--
		The headline leads. Category and date sit underneath it as a byline, where article
		metadata belongs — a small label floated above the title is a kicker, and it makes
		the taxonomy look more important than the story.
	-->
	<header class="mt-8">
		<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-6xl">
			{article.title}
		</h1>

		{#if article.category || article.publishedAt}
			<div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
				{#if article.category}
					<Badge variant="secondary">{article.category}</Badge>
				{/if}
				{#if article.publishedAt}
					<time
						datetime={isoDate(article.publishedAt)}
						class="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
					>
						{m.news_published_on({ date: formatDate(article.publishedAt) })}
					</time>
				{/if}
			</div>
		{/if}
	</header>

	{#if article.coverImageUrl}
		<img
			src={article.coverImageUrl}
			alt=""
			class="border-border mt-10 aspect-1200/630 w-full rounded-xl border object-cover"
		/>
	{:else}
		<Separator class="mt-10" />
	{/if}

	<!--
		`contentHtml` is produced by renderRichText in packages/core, which renders
		the stored document through the TipTap schema and then runs it through
		sanitize-html. It is the only path by which content becomes markup, and it
		always sanitises — see packages/core/src/content/render.ts.
	-->
	<div class="prose prose-neutral dark:prose-invert mt-10 max-w-none">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised server-side, see above -->
		{@html article.contentHtml}
	</div>
</article>
