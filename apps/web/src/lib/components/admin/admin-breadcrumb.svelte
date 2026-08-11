<script lang="ts">
	import { page } from '$app/state';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	/**
	 * Segment labels. Anything not listed falls back to a title-cased segment, so
	 * a new route gets a readable crumb before anyone remembers to come here.
	 */
	const LABELS: Record<string, string> = {
		events: 'Events',
		speakers: 'Speakers',
		articles: 'News',
		sponsors: 'Sponsors',
		checkin: 'Check-in',
		users: 'Users',
		new: 'New',
		registrations: 'Registrants',
		feedback: 'Feedback',
		lineup: 'Line-up'
	};

	const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

	interface Crumb {
		label: string;
		href: string;
	}

	let crumbs = $derived.by<Crumb[]>(() => {
		const segments = page.url.pathname.split('/').filter(Boolean);
		// Everything here is mounted under /admin, which is the root crumb.
		const rest = segments.slice(1);

		const trail: Crumb[] = [{ label: 'Dashboard', href: '/admin' }];
		let href = '/admin';

		for (const segment of rest) {
			href += `/${segment}`;
			// A record id is not a place a reader can name — the crumb for a
			// detail route is the verb, not the UUID.
			const label = ID.test(segment)
				? 'Edit'
				: (LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1));
			trail.push({ label, href });
		}

		return trail;
	});
</script>

<Breadcrumb.Root>
	<Breadcrumb.List>
		{#each crumbs as crumb, i (crumb.href)}
			{#if i > 0}
				<Breadcrumb.Separator class="hidden sm:block" />
			{/if}

			<!--
				Only the last two crumbs survive on a phone. The full trail on a
				detail route is four levels deep, which wraps to three lines at
				320px and pushes the page heading below the fold.
			-->
			<Breadcrumb.Item class={i < crumbs.length - 2 ? 'hidden sm:flex' : undefined}>
				{#if i === crumbs.length - 1}
					<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
				{:else}
					<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
				{/if}
			</Breadcrumb.Item>
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>
