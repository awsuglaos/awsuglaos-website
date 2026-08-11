<script lang="ts">
	import AdminBreadcrumb from '$lib/components/admin/admin-breadcrumb.svelte';
	import AppSidebar from '$lib/components/admin/app-sidebar.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';

	let { data, children } = $props();
</script>

<!--
	`open` is seeded from the cookie the sidebar itself writes, read server-side
	in +layout.server.ts, so the rail renders collapsed on the first paint for
	anyone who left it collapsed.
-->
<Sidebar.Provider open={data.sidebarOpen}>
	<AppSidebar />

	<Sidebar.Inset class="min-w-0">
		<header
			class="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b backdrop-blur-md"
		>
			<div class="flex w-full min-w-0 items-center gap-2 px-4">
				<Sidebar.Trigger class="-ml-1" />
				<Separator orientation="vertical" class="mr-1 data-[orientation=vertical]:h-4" />
				<div class="min-w-0 flex-1"><AdminBreadcrumb /></div>
				<ThemeToggle />
			</div>
		</header>

		<div class="min-w-0 flex-1 p-4 sm:p-6">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
