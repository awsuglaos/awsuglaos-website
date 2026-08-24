import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
/*
 * sst.aws.SvelteKit reads its build from .svelte-kit/svelte-kit-sst/{server,
 * client,prerendered} and expects a lambda-handler/index.handler entry — see
 * .sst/platform/src/components/aws/svelte-kit.ts. adapter-node writes to
 * build/ instead, so deploying with it fails at the Web component.
 *
 * Pinned to the `two` dist-tag: `latest` still points at 2.43.5, which is
 * older than this. Playwright is unaffected — it serves the app with
 * `vite preview`, which reads .svelte-kit/output and is adapter-agnostic.
 */
import adapter from 'svelte-kit-sst';
import paraglideConfig from './paraglide.config.js';

export default defineConfig({
	// The single .env lives at the repo root, shared with the database scripts.
	envDir: '../..',
	plugins: [
		tailwindcss(),
		/*
		 * Must come before `sveltekit()`: it rewrites `<enhanced:img>` in the
		 * markup, so it has to see the component before the Svelte compiler does.
		 * The brand logos ship as ~1 MB 1254px PNGs; this emits AVIF/WebP at the
		 * sizes actually used, with intrinsic width and height so they reserve
		 * their space before decoding.
		 */
		enhancedImages(),
		/*
		 * Options live in ./paraglide.config.js because svelte-check needs the
		 * generated $lib/paraglide/* modules too, and `pnpm check` never runs Vite.
		 * scripts/compile-paraglide.mjs reads the same file.
		 */
		paraglideVitePlugin(paraglideConfig),
		/*
		 * All SvelteKit configuration lives here. Passing any option to this plugin
		 * makes SvelteKit ignore svelte.config.js entirely, so splitting it across
		 * both files silently drops half the settings.
		 */
		sveltekit({
			adapter: adapter(),
			// SvelteKit resolves its own .env directory independently of Vite's
			// `envDir` above; both have to point at the repo root.
			env: { dir: '../..' },
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			}
		})
	]
});
