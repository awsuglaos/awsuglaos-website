import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';

/**
 * The single schema definition, imported by both the browser editor and the
 * server-side renderer.
 *
 * These must be the same list in both places. The renderer silently drops any
 * node type it does not know, so a table added only to the editor's list would
 * save fine and then vanish on the public page — a bug that looks like data
 * loss and is invisible until someone views the post.
 *
 * Exposed on its own entry point (`@awsug/shared/tiptap`) rather than the
 * package barrel, so importing a Zod schema on a public page does not drag
 * ProseMirror into that bundle.
 */
export const richTextExtensions = [
	StarterKit.configure({
		heading: { levels: [2, 3, 4] },
		link: {
			openOnClick: false,
			autolink: true,
			// Anything not http(s)/mailto is dropped at the schema level, before
			// the sanitiser ever sees it.
			protocols: ['http', 'https', 'mailto']
		}
	}),
	Image.configure({
		inline: false,
		allowBase64: false
	}),
	Table.configure({ resizable: false }),
	TableRow,
	TableHeader,
	TableCell
];
