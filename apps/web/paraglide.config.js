/**
 * Paraglide compiler options, shared by two callers.
 *
 * This lives outside vite.config.ts because Vite is not the only thing that
 * needs the generated output. `svelte-check` type-checks against
 * `$lib/paraglide/*`, and those modules only exist once the compiler has run —
 * but `pnpm check` never invokes Vite, so on a clean checkout (CI, or a fresh
 * clone) every import of them fails to resolve. `scripts/compile-paraglide.js`
 * runs the same compiler directly, and both read this file, so the URL routing
 * below cannot drift between the two paths.
 *
 * @type {import('@inlang/paraglide-js').CompilerOptions}
 */
export default {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	/*
	 * Set explicitly to whatever the Vite plugin would have chosen for itself.
	 * The plugin overrides this default when it compiles; the CLI does not, so
	 * without pinning it the two callers emit a runtime.js that differs on this
	 * one line depending on which ran last. Harmless — a Vite build always wins
	 * before anything ships — but a confusing diff to stumble over.
	 *
	 * `import.meta.env?.SSR` is the tree-shaking flag Vite replaces at build
	 * time; the `typeof window` half is the fallback for any context that does
	 * not define it.
	 */
	isServer: "import.meta.env?.SSR ?? typeof window === 'undefined'",
	// `url` first so a shared link always pins its language; `cookie` then
	// remembers a visitor's toggle across pages; `baseLocale` is the floor.
	strategy: ['url', 'cookie', 'baseLocale'],
	// Lao is the base locale and stays unprefixed at `/`; English lives under
	// `/en`. Swap the two rows in each `localized` list to lead with English
	// instead.
	urlPatterns: [
		{
			// The root needs its own exact pattern: an optional path parameter
			// matches `/` fine but cannot be *filled* when building the URL back
			// up, which throws "Missing value for path".
			pattern: '/',
			localized: [
				['en', '/en'],
				['lo', '/']
			]
		},
		{
			// English first — matching is order-sensitive and the Lao pattern
			// matches every path, including `/en/...`.
			pattern: '/:path(.*)',
			localized: [
				['en', '/en/:path(.*)'],
				['lo', '/:path(.*)']
			]
		}
	]
};
