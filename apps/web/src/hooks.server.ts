import { paraglideMiddleware } from '$lib/paraglide/server';
import type { Handle, HandleServerError } from '@sveltejs/kit';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			// Sets <html lang> so screen readers and the Lao font stack both get the
			// right language.
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

export const handle: Handle = handleParaglide;

export const handleError: HandleServerError = ({ error, status }) => {
	// 404s are noise; anything else is worth a CloudWatch line.
	if (status !== 404) {
		console.error('Unhandled server error', error);
	}
	return { message: 'Unexpected error' };
};
