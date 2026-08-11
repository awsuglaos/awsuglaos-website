<script lang="ts">
	import BrandLogo from '$lib/components/brand-logo.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';

	let { data, form } = $props();
</script>

<Seo title="Sign in" noindex />

<!--
	Standalone: /admin/* is excluded from the public header and footer, so this
	page owns the whole viewport and carries its own theme control.
-->
<div class="bg-muted/40 relative isolate grid min-h-dvh place-items-center px-4 py-16">
	<div class="absolute top-4 right-4"><ThemeToggle /></div>

	<div class="w-full max-w-sm">
		<div class="flex flex-col items-center text-center">
			<!--
				The lockup, not the mark: this page has no header above it, so the
				logo is the only thing naming the site.
			-->
			<BrandLogo variant="lockup" class="w-24" alt="AWS User Group Lao" eager />
			<h1 class="mt-6 text-2xl font-bold tracking-tight">Backoffice</h1>
			<p class="text-muted-foreground mt-1 text-sm">Sign in to manage events and news.</p>
		</div>

		{#if form?.message}
			<Alert variant="destructive" class="mt-6">
				<AlertCircle class="size-4" />
				<AlertDescription>{form.message}</AlertDescription>
			</Alert>
		{/if}

		<Card.Root class="mt-6 [--card-spacing:--spacing(6)]">
			<Card.Content>
				{#if data.devAuth}
					<form method="POST" action="?/dev">
						<Field.FieldGroup>
							<Field.Field>
								<Field.FieldLabel for="email">Email address</Field.FieldLabel>
								<Input
									id="email"
									name="email"
									type="email"
									required
									autocomplete="email"
									autofocus
									placeholder="you@example.la"
								/>
							</Field.Field>
						</Field.FieldGroup>

						<Button type="submit" class="mt-6 w-full">Sign in</Button>
					</form>
				{:else}
					<!-- Wired up in M8, once the Cognito user pool exists. -->
					<Button href="/admin/login/cognito" class="w-full">Continue with Cognito</Button>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if data.devAuth}
			<Alert class="mt-4">
				<AlertDescription class="text-xs">
					<strong>Local development mode.</strong> Any email that exists in the
					<code class="bg-muted rounded px-1 py-0.5 font-mono">users</code> table signs in without
					a password. Production replaces this with the Cognito Hosted UI and enforced MFA.
				</AlertDescription>
			</Alert>
		{/if}
	</div>
</div>
