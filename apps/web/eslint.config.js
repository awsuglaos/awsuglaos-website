import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			"no-undef": 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Paraglide compiles messages into this directory on every build. It is
		// generated output, not source, and ships its own eslint-disable headers.
		ignores: ['src/lib/paraglide/**', '.svelte-kit/**']
	},
	{
		rules: {
			/*
			 * This rule wants every internal href wrapped in SvelteKit's `resolve()`
			 * so links stay correct under a configured `paths.base`. This app has no
			 * base path, and its localized links already go through Paraglide's
			 * `localizeHref()`, which owns the /en prefix. Wrapping them again would
			 * add a second path rewriter with no behaviour to fix.
			 *
			 * Revisit if the site is ever served from a subdirectory.
			 */
			'svelte/no-navigation-without-resolve': 'off'
		}
	}
);
