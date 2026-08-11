<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/admin/page-header.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import Camera from '@lucide/svelte/icons/camera';
	import CameraOff from '@lucide/svelte/icons/camera-off';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	let { form } = $props();

	let ticketCode = $state('');
	let scanning = $state(false);
	let scannerError = $state('');
	let video = $state<HTMLVideoElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);

	let stream: MediaStream | null = null;
	let stopLoop: (() => void) | null = null;

	/**
	 * Uses the browser's built-in BarcodeDetector where it exists (Chrome, Edge,
	 * Android) rather than shipping a QR decoding library. Everywhere else the
	 * manual field below is the fallback — which is also what staff use when a
	 * phone screen is too dim or cracked to scan.
	 */
	function detectorSupported(): boolean {
		return typeof window !== 'undefined' && 'BarcodeDetector' in window;
	}

	async function startScanner() {
		scannerError = '';
		if (!detectorSupported()) {
			scannerError = 'This browser cannot scan QR codes. Type the ticket code instead.';
			return;
		}

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' }
			});
		} catch {
			scannerError = 'Camera permission was denied. Type the ticket code instead.';
			return;
		}

		scanning = true;
		await Promise.resolve();
		if (!video) return;
		video.srcObject = stream;
		await video.play();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
		let cancelled = false;
		stopLoop = () => (cancelled = true);

		const tick = async () => {
			if (cancelled || !video) return;
			try {
				const codes = await detector.detect(video);
				const value = codes[0]?.rawValue?.trim();
				if (value) {
					ticketCode = value.toUpperCase();
					stopScanner();
					formEl?.requestSubmit();
					return;
				}
			} catch {
				// A dropped frame is not worth surfacing; keep polling.
			}
			requestAnimationFrame(() => void tick());
		};
		void tick();
	}

	function stopScanner() {
		stopLoop?.();
		stopLoop = null;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		scanning = false;
	}

	// Release the camera when leaving the page.
	$effect(() => () => stopScanner());
</script>

<Seo title="Check-in" noindex />

<PageHeader
	title="Check-in"
	description="Scan an attendee's QR code, or type the ticket code from their confirmation email."
/>

<!--
	The result sits directly under the heading, above both inputs, so a host
	working the door at arm's length reads the outcome without hunting for it.
-->
{#if form}
	{#if 'ok' in form && form.ok}
		<Alert class="border-primary/40 bg-primary/5 mt-6">
			<CircleCheck class="text-primary size-4" />
			<AlertDescription>
				<strong class="text-foreground">{form.result.fullName}</strong> checked in.
				<span class="text-muted-foreground block font-mono text-xs">{form.result.ticketCode}</span>
			</AlertDescription>
		</Alert>
	{:else if 'message' in form}
		<Alert variant="destructive" class="mt-6">
			<AlertCircle class="size-4" />
			<AlertDescription>{form.message}</AlertDescription>
		</Alert>
	{/if}
{/if}

<div class="mt-6 grid gap-6 lg:grid-cols-2">
	<Card.Root class="[--card-spacing:--spacing(5)]">
		<Card.Header>
			<Card.Title>Scanner</Card.Title>
		</Card.Header>

		<Card.Content>
			{#if scanning}
				<!-- A live camera preview, muted and captionless by nature. -->
				<video
					bind:this={video}
					muted
					playsinline
					class="aspect-square w-full rounded-lg bg-black object-cover"
				></video>
				<Button onclick={stopScanner} variant="outline" size="sm" class="mt-4 w-full">
					<CameraOff data-icon="inline-start" />
					Stop camera
				</Button>
			{:else}
				<div
					class="border-border text-muted-foreground grid aspect-square w-full place-items-center rounded-lg border border-dashed"
				>
					<div class="flex flex-col items-center gap-2">
						<Camera class="size-6" aria-hidden="true" />
						<span class="text-sm">Camera is off</span>
					</div>
				</div>
				<Button onclick={startScanner} size="sm" class="mt-4 w-full">
					<Camera data-icon="inline-start" />
					Start camera
				</Button>
			{/if}

			{#if scannerError}
				<p class="text-muted-foreground mt-3 text-xs">{scannerError}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="[--card-spacing:--spacing(5)]">
		<Card.Header>
			<Card.Title>Ticket code</Card.Title>
			<Card.Description>Works when the camera cannot — a dim or cracked screen.</Card.Description>
		</Card.Header>

		<Card.Content>
			<form
				bind:this={formEl}
				method="POST"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
						ticketCode = '';
					}}
			>
				<Field.FieldGroup>
					<Field.Field>
						<Field.FieldLabel for="ticketCode" class="sr-only">Ticket code</Field.FieldLabel>
						<Input
							id="ticketCode"
							name="ticketCode"
							bind:value={ticketCode}
							required
							autocomplete="off"
							autocapitalize="characters"
							spellcheck={false}
							placeholder="01KZN5CRFP…"
							class="h-10 font-mono text-base tracking-wider"
						/>
					</Field.Field>
				</Field.FieldGroup>

				<Button type="submit" class="mt-5 w-full">Check in</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
