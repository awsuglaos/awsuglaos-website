// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Error {
			message: string;
		}
		interface Locals {
			/** Set by the admin auth hook; undefined on public routes. */
			user?: {
				id: string;
				email: string;
				name: string;
				role: 'admin' | 'editor';
			};
		}
		// interface PageData {}
		interface PageState {
			/**
			 * The registrant whose answers are open in the detail panel.
			 *
			 * The panel is pushed onto history rather than navigated to, because
			 * opening it must not re-run the page's `load` and refetch the list,
			 * the stats and the event just to show what is already in memory. A
			 * shallow push deliberately leaves `page.url` pointing at the last
			 * real navigation, so this — not the query string — is what the page
			 * reads once the router is running. `null` means "closed"; the key
			 * being absent means "nobody has touched the panel, read the URL".
			 */
			registrant?: string | null;
		}
		// interface Platform {}
	}
}

export {};
