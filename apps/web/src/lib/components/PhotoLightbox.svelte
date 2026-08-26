<script lang="ts">
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as m from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Download from '@lucide/svelte/icons/download';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import X from '@lucide/svelte/icons/x';

	interface Photo {
		id: string;
		url: string;
		caption: string | null;
	}

	interface Props {
		photos: Photo[];
		class?: string;
	}

	let { photos, class: className }: Props = $props();

	let open = $state(false);
	let index = $state(0);

	let current = $derived(photos[index]);

	/*
	 * Which thumbnail opened the lightbox. bits-ui restores focus to the element
	 * that had it when the dialog opened, which here is the *first* thumbnail
	 * unless we say otherwise — closing after paging to photo twelve would send
	 * the keyboard back to the top of the grid.
	 */
	let openedFrom = $state<HTMLElement | null>(null);

	function openAt(at: number, trigger: HTMLElement) {
		index = at;
		openedFrom = trigger;
		open = true;
	}

	// Wraps in both directions: at the last photo, "next" returns to the first.
	// A gallery is a loop, not a document with an end to fall off.
	const step = (by: number) => {
		index = (index + by + photos.length) % photos.length;
	};

	function onKeydown(event: KeyboardEvent) {
		if (photos.length < 2) return;
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			step(1);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			step(-1);
		}
	}

	/*
	 * Swipe. A phone is where these are looked at, and reaching for a 40px arrow
	 * with a thumb is not how anyone browses photographs.
	 *
	 * The threshold is horizontal distance *and* a dominant axis, so scrolling a
	 * tall photo up and down does not page sideways by accident.
	 *
	 * Listened for on the dialog rather than on the image, so a swipe anywhere in
	 * the frame counts — and so the handlers sit on an element that already has
	 * `role="dialog"` rather than on a bare div.
	 */
	const SWIPE_THRESHOLD = 50;
	let touchStart: { x: number; y: number } | null = null;

	function onTouchStart(event: TouchEvent) {
		const touch = event.changedTouches[0];
		touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
	}

	function onTouchEnd(event: TouchEvent) {
		const touch = event.changedTouches[0];
		if (!touchStart || !touch || photos.length < 2) return;

		const dx = touch.clientX - touchStart.x;
		const dy = touch.clientY - touchStart.y;
		touchStart = null;

		if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
		step(dx < 0 ? 1 : -1);
	}

	/**
	 * An upload is site-relative and served from this origin, so `download` saves
	 * it. Browsers ignore `download` cross-origin — for a photo linked from
	 * somewhere else the honest offer is to open it, not a button that silently
	 * navigates instead of saving.
	 */
	const isUpload = (url: string) => url.startsWith('/uploads/');

	/** "2026-08-awsug-42.jpg" out of the stored path, for the saved filename. */
	function fileNameOf(url: string): string {
		return url.split('/').pop()?.split('?')[0] || 'photo';
	}
</script>

<ul class={cn('grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4', className)}>
	{#each photos as photo, at (photo.id)}
		<li>
			<figure class="m-0">
				<!--
					A fixed aspect box rather than intrinsic dimensions: the sizes are not
					known server-side, and without it the grid reflows as each photo
					decodes.
				-->
				<button
					type="button"
					class="group focus-visible:ring-ring block w-full cursor-zoom-in overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
					aria-label="{m.photo_view()}{photo.caption ? `: ${photo.caption}` : ''}"
					onclick={(event) => openAt(at, event.currentTarget)}
				>
					<img
						src={photo.url}
						alt={photo.caption ?? ''}
						loading="lazy"
						decoding="async"
						class="border-border bg-muted aspect-4/3 w-full rounded-lg border object-cover transition-transform duration-300 group-hover:scale-[1.03]"
					/>
				</button>
				{#if photo.caption}
					<figcaption class="text-muted-foreground mt-1.5 text-xs">
						{photo.caption}
					</figcaption>
				{/if}
			</figure>
		</li>
	{/each}
</ul>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) openedFrom?.focus();
	}}
>
	{#if current}
		<Dialog.Content
			showCloseButton={false}
			onkeydown={onKeydown}
			ontouchstart={onTouchStart}
			ontouchend={onTouchEnd}
			class="border-0 bg-transparent p-0 shadow-none sm:max-w-none max-w-none w-screen h-dvh translate-x-0 translate-y-0 top-0 left-0 grid-rows-[auto_1fr_auto] gap-0"
		>
			<!--
				The title names the photo for assistive tech but is not drawn — a
				lightbox that puts a heading above the picture is a modal, not a
				lightbox. bits-ui requires it either way.
			-->
			<Dialog.Title class="sr-only">
				{current.caption ?? m.photo_gallery()}
			</Dialog.Title>

			<div class="flex items-center justify-between gap-4 px-4 py-3 text-white">
				<span class="font-mono text-xs tracking-[0.14em] tabular-nums">
					{m.photo_counter({ index: index + 1, total: photos.length })}
				</span>

				<div class="flex items-center gap-1">
					{#if isUpload(current.url)}
						<a
							href={current.url}
							download={fileNameOf(current.url)}
							class={cn(
								buttonVariants({ variant: 'ghost', size: 'sm' }),
								'text-white hover:bg-white/15 hover:text-white'
							)}
						>
							<Download data-icon="inline-start" />
							{m.photo_download()}
						</a>
					{:else}
						<a
							href={current.url}
							target="_blank"
							rel="noopener noreferrer"
							class={cn(
								buttonVariants({ variant: 'ghost', size: 'sm' }),
								'text-white hover:bg-white/15 hover:text-white'
							)}
						>
							<ExternalLink data-icon="inline-start" />
							{m.photo_open_original()}
						</a>
					{/if}

					<Dialog.Close
						class={cn(
							buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
							'text-white hover:bg-white/15 hover:text-white'
						)}
					>
						<X />
						<span class="sr-only">{m.photo_close()}</span>
					</Dialog.Close>
				</div>
			</div>

			<div class="relative flex min-h-0 items-center justify-center px-4">
				<img
					src={current.url}
					alt={current.caption ?? ''}
					class="max-h-full max-w-full rounded-lg object-contain"
				/>

				{#if photos.length > 1}
					<Button
						variant="ghost"
						size="icon"
						onclick={() => step(-1)}
						aria-label={m.photo_previous()}
						class="absolute left-2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white sm:left-4"
					>
						<ChevronLeft />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onclick={() => step(1)}
						aria-label={m.photo_next()}
						class="absolute right-2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white sm:right-4"
					>
						<ChevronRight />
					</Button>
				{/if}
			</div>

			<p class="min-h-10 px-4 py-3 text-center text-sm text-white/80">
				{current.caption ?? ''}
			</p>
		</Dialog.Content>
	{/if}
</Dialog.Root>
