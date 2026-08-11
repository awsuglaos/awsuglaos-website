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
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
