import { compile } from '@inlang/paraglide-js';
import config from '../paraglide.config.js';

/*
 * Generates src/lib/paraglide/* without going through Vite.
 *
 * `pnpm check` needs those modules to exist before svelte-check runs, and a
 * clean checkout has none of them — the compiler's own .gitignore in the output
 * directory keeps all of it untracked. Running the build first would work but
 * costs far more than the compile itself.
 */
await compile(config);
