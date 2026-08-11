<script lang="ts">
	import ArticleCard from '$lib/components/ArticleCard.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import Newspaper from '@lucide/svelte/icons/newspaper';
	import Search from '@lucide/svelte/icons/search';

	let { data } = $props();
</script>

<Seo title={m.news_title()} description={m.news_subtitle()} />

<div class="mx-auto max-w-6xl px-4 py-14 sm:py-20">
	<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-6xl">{m.news_title()}</h1>
	<p class="text-muted-foreground mt-4 max-w-2xl text-lg text-pretty">{m.news_subtitle()}</p>

	<!--
		A plain GET form: search works with JavaScript disabled and every result
		page has a shareable URL.
	-->
	<form method="GET" class="mt-10 flex flex-wrap items-center gap-3">
		<div class="min-w-56 flex-1">
			<Label for="q" class="sr-only">{m.news_search()}</Label>
			<InputGroup.Root>
				<InputGroup.Addon>
					<Search aria-hidden="true" />
				</InputGroup.Addon>
				<InputGroup.Input
					id="q"
					name="q"
					type="search"
					value={data.search}
					placeholder={m.news_search()}
				/>
			</InputGroup.Root>
		</div>
		{#if data.category}
			<input type="hidden" name="category" value={data.category} />
		{/if}
		<Button type="submit" variant="secondary">{m.news_search()}</Button>
	</form>

	<!--
		Filters are `Button`s rather than hand-styled pills: they get the design system's own
		focus ring, hover and disabled behaviour for free, and a real control-sized hit area
		on a phone. They are still plain links, so filtering works without JavaScript and
		every filtered view has its own shareable URL.
	-->
	{#if data.categories.length > 0}
		<nav class="mt-4 flex flex-wrap gap-2" aria-label={m.news_all_categories()}>
			<Button
				href={localizeHref('/news')}
				variant={data.category === '' ? 'default' : 'outline'}
				size="sm"
				aria-current={data.category === '' ? 'page' : undefined}
			>
				{m.news_all_categories()}
			</Button>
			{#each data.categories as category (category)}
				<Button
					href="{localizeHref('/news')}?category={encodeURIComponent(category)}"
					variant={data.category === category ? 'default' : 'outline'}
					size="sm"
					aria-current={data.category === category ? 'page' : undefined}
				>
					{category}
				</Button>
			{/each}
		</nav>
	{/if}

	<Separator class="mt-10" />

	{#if data.articles.length > 0}
		<ul
			class="mt-10 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-6 p-0"
		>
			{#each data.articles as article (article.id)}
				<li class="min-w-0"><ArticleCard {article} /></li>
			{/each}
		</ul>
	{:else}
		<Empty.Root class="mt-10 border">
			<Empty.Header>
				<Empty.Media variant="icon"><Newspaper /></Empty.Media>
				<Empty.Description>{m.news_none()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>
