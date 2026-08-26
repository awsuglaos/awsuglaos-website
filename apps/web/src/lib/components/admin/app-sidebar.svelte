<script lang="ts">
	import { page } from '$app/state';
	import BrandLogo from '$lib/components/brand-logo.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Handshake from '@lucide/svelte/icons/handshake';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import LogOut from '@lucide/svelte/icons/log-out';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Mic from '@lucide/svelte/icons/mic';
	import Newspaper from '@lucide/svelte/icons/newspaper';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Users from '@lucide/svelte/icons/users';

	/*
	 * Two groups rather than one flat list: "Content" is what an editor touches
	 * every week, "Operations" is what a host touches on the day of an event.
	 * The split is what makes the icon-collapsed rail readable — the separator
	 * survives the collapse, the labels do not.
	 */
	const groups = [
		{
			label: 'Content',
			items: [
				{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
				{ href: '/admin/events', label: 'Events', icon: CalendarDays, exact: false },
				{ href: '/admin/speakers', label: 'Speakers', icon: Mic, exact: false },
				{ href: '/admin/articles', label: 'News', icon: Newspaper, exact: false },
				{ href: '/admin/sponsors', label: 'Sponsors', icon: Handshake, exact: false }
			]
		},
		{
			label: 'Operations',
			items: [
				{ href: '/admin/checkin', label: 'Check-in', icon: QrCode, exact: false },
				{ href: '/admin/feedback', label: 'Feedback', icon: MessageSquare, exact: false },
				{ href: '/admin/users', label: 'Users', icon: Users, exact: false }
			]
		}
	];

	/*
	 * How many messages are waiting for a decision. It rides along on the
	 * dashboard payload the protected layout already loads, so the badge costs no
	 * extra request — and a queue nobody can see is a queue nobody empties.
	 */
	let pendingFeedback = $derived(page.data.dashboard?.totals?.pendingFeedback ?? 0);

	function isActive(item: { href: string; exact: boolean }): boolean {
		return item.exact ? page.url.pathname === item.href : page.url.pathname.startsWith(item.href);
	}
</script>

<Sidebar.Root variant="inset" collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="/admin" {...props}>
							<BrandLogo class="size-8 shrink-0 rounded-md" />
							<div class="grid flex-1 text-left leading-tight">
								<span class="truncate text-sm font-semibold">AWS User Group Lao</span>
								<span class="text-muted-foreground truncate text-xs">Backoffice</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		{#each groups as group (group.label)}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.items as item (item.href)}
							{@const Icon = item.icon}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={isActive(item)} tooltipContent={item.label}>
									{#snippet child({ props })}
										<a
											href={item.href}
											aria-current={isActive(item) ? 'page' : undefined}
											{...props}
										>
											<Icon />
											<span>{item.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>

								{#if item.href === '/admin/feedback' && pendingFeedback > 0}
									<Sidebar.MenuBadge>{pendingFeedback}</Sidebar.MenuBadge>
								{/if}
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent="View the public site">
					{#snippet child({ props })}
						<a href="/" target="_blank" rel="noopener" {...props}>
							<ExternalLink />
							<span>View site</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>

			<Sidebar.MenuItem>
				<!--
					A real POST form, not a link: signing out clears a session cookie,
					which must not be reachable by a prefetch or a crawler following a
					GET.
				-->
				<form method="POST" action="/admin/logout" class="w-full">
					<Sidebar.MenuButton tooltipContent="Sign out">
						{#snippet child({ props })}
							<!--
								`type="submit"` comes *after* the spread, and that order is the
								whole button. `tooltipContent` makes this render through bits-ui's
								Tooltip.Trigger, which merges `{ type: "button" }` last into the
								props it hands down — so spreading afterwards turns the submit
								button into an inert one and sign-out silently does nothing. The
								same trap as the one documented in confirm-submit.svelte, in the
								opposite direction.
							-->
							<button {...props} type="submit">
								<LogOut />
								<span>Sign out</span>
							</button>
						{/snippet}
					</Sidebar.MenuButton>
				</form>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
