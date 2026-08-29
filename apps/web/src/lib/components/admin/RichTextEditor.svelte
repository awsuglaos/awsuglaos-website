<script lang="ts">
	import { richTextExtensions } from '@awsug/shared/tiptap';
	import { EMPTY_DOC, type RichTextDoc } from '@awsug/shared';
	import { Editor } from '@tiptap/core';
	import {
		Bold,
		Code,
		Heading2,
		Heading3,
		ImagePlus,
		Italic,
		Link2,
		List,
		ListOrdered,
		Quote,
		Redo2,
		Table as TableIcon,
		Undo2
	} from '@lucide/svelte';
	import { uploadImage } from '$lib/upload';

	interface Props {
		/**
		 * Form field the JSON document is submitted under. Omit it when the
		 * document is not part of a normal form post — the form builder keeps its
		 * blocks in one JSON payload and takes the document through `onChange`
		 * instead, and a stray hidden input would just add noise to the body.
		 */
		name?: string;
		value?: RichTextDoc | null;
		label?: string;
		describedBy?: string;
		/**
		 * Language of the text being written, e.g. `lo`. Set it on bilingual forms
		 * so the Lao and English editors sitting next to each other each pick the
		 * right font and line breaking.
		 */
		lang?: string;
		/** Called on every edit, with the document as it now stands. */
		onChange?: (doc: RichTextDoc) => void;
	}

	let { name, value = null, label, describedBy, lang, onChange }: Props = $props();

	let element = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);
	let serialized = $state(JSON.stringify(value ?? EMPTY_DOC));
	let uploading = $state(false);
	let uploadError = $state('');

	/**
	 * `svelte-tiptap` is deliberately not used: it relies on Svelte components
	 * being classes, which Svelte 5 removed. TipTap's editor is a plain object
	 * that mutates in place, so reactivity comes from bumping a counter on its
	 * transaction event rather than from reassigning the instance.
	 */
	let version = $state(0);

	$effect(() => {
		if (!element) return;

		const instance = new Editor({
			element,
			extensions: richTextExtensions,
			content: value ?? EMPTY_DOC,
			editorProps: {
				attributes: {
					class:
						'prose prose-neutral dark:prose-invert max-w-none min-h-56 px-3 py-2 focus:outline-none',
					...(lang ? { lang } : {})
				}
			},
			onTransaction: ({ editor: current }: { editor: Editor }) => {
				version += 1;
				const doc = current.getJSON() as RichTextDoc;
				serialized = JSON.stringify(doc);
				onChange?.(doc);
			}
		});

		editor = instance;
		serialized = JSON.stringify(instance.getJSON());

		return () => {
			instance.destroy();
			editor = null;
		};
	});

	// Reading `version` inside these keeps the toolbar's active states in sync —
	// without it Svelte has no idea the editor mutated.
	function isActive(nameOrType: string, attrs?: Record<string, unknown>): boolean {
		void version;
		return editor?.isActive(nameOrType, attrs) ?? false;
	}

	function can(action: 'undo' | 'redo'): boolean {
		void version;
		if (!editor) return false;
		return action === 'undo' ? editor.can().undo() : editor.can().redo();
	}

	async function pickImage() {
		uploadError = '';
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file || !editor) return;

			uploading = true;
			try {
				const url = await uploadImage(file);
				editor.chain().focus().setImage({ src: url, alt: file.name }).run();
			} catch (error) {
				uploadError = error instanceof Error ? error.message : 'Upload failed';
			} finally {
				uploading = false;
			}
		};

		input.click();
	}

	function setLink() {
		if (!editor) return;
		const previous = editor.getAttributes('link').href as string | undefined;
		const href = window.prompt('Link URL', previous ?? 'https://');
		if (href === null) return;

		if (href === '') {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
	}

	const toolbar = $derived([
		{
			icon: Bold,
			label: 'Bold',
			run: () => editor?.chain().focus().toggleBold().run(),
			active: isActive('bold')
		},
		{
			icon: Italic,
			label: 'Italic',
			run: () => editor?.chain().focus().toggleItalic().run(),
			active: isActive('italic')
		},
		{
			icon: Code,
			label: 'Code',
			run: () => editor?.chain().focus().toggleCode().run(),
			active: isActive('code')
		},
		{
			icon: Heading2,
			label: 'Heading 2',
			run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
			active: isActive('heading', { level: 2 })
		},
		{
			icon: Heading3,
			label: 'Heading 3',
			run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
			active: isActive('heading', { level: 3 })
		},
		{
			icon: List,
			label: 'Bullet list',
			run: () => editor?.chain().focus().toggleBulletList().run(),
			active: isActive('bulletList')
		},
		{
			icon: ListOrdered,
			label: 'Numbered list',
			run: () => editor?.chain().focus().toggleOrderedList().run(),
			active: isActive('orderedList')
		},
		{
			icon: Quote,
			label: 'Quote',
			run: () => editor?.chain().focus().toggleBlockquote().run(),
			active: isActive('blockquote')
		},
		{ icon: Link2, label: 'Link', run: setLink, active: isActive('link') },
		{
			icon: TableIcon,
			label: 'Insert table',
			run: () =>
				editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
			active: false
		}
	]);
</script>

<div class="border-input bg-background overflow-hidden rounded-lg border">
	{#if label}
		<span class="sr-only">{label}</span>
	{/if}

	<div class="border-border bg-muted/40 flex flex-wrap items-center gap-0.5 border-b p-1">
		{#each toolbar as item (item.label)}
			{@const Icon = item.icon}
			<button
				type="button"
				title={item.label}
				aria-label={item.label}
				aria-pressed={item.active}
				onclick={item.run}
				class="hover:bg-muted rounded-md p-1.5 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
			>
				<Icon class="size-4" />
			</button>
		{/each}

		<button
			type="button"
			title="Insert image"
			aria-label="Insert image"
			onclick={pickImage}
			disabled={uploading}
			class="hover:bg-muted rounded-md p-1.5 disabled:opacity-50"
		>
			<ImagePlus class="size-4" />
		</button>

		<span class="mx-1 flex-1"></span>

		<button
			type="button"
			title="Undo"
			aria-label="Undo"
			onclick={() => editor?.chain().focus().undo().run()}
			disabled={!can('undo')}
			class="hover:bg-muted rounded-md p-1.5 disabled:opacity-40"
		>
			<Undo2 class="size-4" />
		</button>
		<button
			type="button"
			title="Redo"
			aria-label="Redo"
			onclick={() => editor?.chain().focus().redo().run()}
			disabled={!can('redo')}
			class="hover:bg-muted rounded-md p-1.5 disabled:opacity-40"
		>
			<Redo2 class="size-4" />
		</button>
	</div>

	<!-- data-editor gives tests a stable handle on a specific editor instance,
	     since ProseMirror replaces the id-bearing element it mounts into. -->
	<div bind:this={element} data-editor={name} aria-describedby={describedBy}></div>

	{#if uploading}
		<p class="text-muted-foreground border-border border-t px-3 py-1.5 text-xs">Uploading image…</p>
	{/if}
	{#if uploadError}
		<p class="text-destructive border-border border-t px-3 py-1.5 text-xs">{uploadError}</p>
	{/if}
</div>

<!--
	The document travels as JSON in a hidden field, so the form still posts
	normally and the server validates the same shape it stores.
-->
{#if name}
	<input type="hidden" {name} value={serialized} />
{/if}

<style>
	:global(.ProseMirror table) {
		width: 100%;
		border-collapse: collapse;
	}
	:global(.ProseMirror th),
	:global(.ProseMirror td) {
		border: 1px solid var(--border);
		padding: 0.375rem 0.5rem;
	}
	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--muted-foreground);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
