import { z } from 'zod';

/**
 * A TipTap / ProseMirror document.
 *
 * Content is stored as this JSON rather than as HTML. HTML in the database
 * would mean trusting whatever an editor's browser produced and re-parsing it
 * on every read; JSON keeps the structure addressable, lets the server decide
 * what markup it becomes, and makes sanitisation a property of the renderer
 * rather than of the stored data.
 */
/*
 * The `| undefined` on each optional member is required, not noise: the project
 * runs with `exactOptionalPropertyTypes`, under which `attrs?: T` means "either
 * absent or a T" and rejects an explicit `undefined`. Zod's inferred output
 * produces `T | undefined`, so without this the schema will not typecheck
 * against its own interface.
 */
export interface RichTextMark {
	type: string;
	attrs?: Record<string, unknown> | undefined;
}

export interface RichTextNode {
	type: string;
	attrs?: Record<string, unknown> | undefined;
	content?: RichTextNode[] | undefined;
	marks?: RichTextMark[] | undefined;
	text?: string | undefined;
}

export interface RichTextDoc {
	type: 'doc';
	content?: RichTextNode[] | undefined;
}

/**
 * Validates the document *shape* only — that it is a well-formed ProseMirror
 * tree. It deliberately does not police which node types appear: that is the
 * renderer's job, which drops anything not in its schema, and the sanitiser's,
 * which strips anything dangerous from the resulting HTML. Enforcing the node
 * allowlist in three places would guarantee they drift apart.
 */
const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
	z.object({
		type: z.string().min(1),
		attrs: z.record(z.string(), z.unknown()).optional(),
		content: z.array(richTextNodeSchema).optional(),
		marks: z
			.array(z.object({ type: z.string().min(1), attrs: z.record(z.string(), z.unknown()).optional() }))
			.optional(),
		text: z.string().optional()
	})
);

export const richTextDocSchema: z.ZodType<RichTextDoc> = z.object({
	type: z.literal('doc'),
	content: z.array(richTextNodeSchema).optional()
});

export const EMPTY_DOC: RichTextDoc = { type: 'doc', content: [] };

/** True when the document has no text in it — used to enforce "required" fields. */
export function isRichTextEmpty(doc: RichTextDoc | null | undefined): boolean {
	if (!doc?.content?.length) return true;
	return richTextToPlainText(doc).trim() === '';
}

/**
 * Flattens a document to plain text. Used for meta descriptions, excerpts,
 * search and structured data — everywhere a summary is needed and markup would
 * be noise.
 */
export function richTextToPlainText(doc: RichTextDoc | null | undefined): string {
	if (!doc) return '';

	const parts: string[] = [];

	const walk = (nodes: readonly RichTextNode[] | undefined): void => {
		if (!nodes) return;
		for (const node of nodes) {
			if (typeof node.text === 'string') parts.push(node.text);
			walk(node.content);
			// Block-level nodes end with a break so words do not run together.
			if (node.type === 'paragraph' || node.type?.startsWith('heading')) parts.push('\n\n');
			if (node.type === 'listItem' || node.type === 'tableRow') parts.push('\n');
		}
	};

	walk(doc.content);
	return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/** Builds a document from plain text, splitting paragraphs on blank lines. */
export function plainTextToRichText(text: string): RichTextDoc {
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p !== '');

	return {
		type: 'doc',
		content: paragraphs.map((p) => ({
			type: 'paragraph',
			content: [{ type: 'text', text: p }]
		}))
	};
}
