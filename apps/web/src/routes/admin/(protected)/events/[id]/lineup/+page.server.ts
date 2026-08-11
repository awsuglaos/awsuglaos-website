import { adminApi } from '$lib/server/admin';
import { parseEventSpeakersForm, parseEventSponsorsForm } from '$lib/server/parse-admin-forms';
import { isDomainError, setEventSpeakersInputSchema, setEventSponsorsInputSchema } from '@awsug/shared';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface EventSpeakerRow {
	id: string;
	speakerId: string;
	name: string;
	talkTitle: string | null;
	abstract: string | null;
	sortOrder: number;
}

interface EventSponsorRow {
	sponsorId: string;
	name: string;
	logoUrl: string;
	tier: 'platinum' | 'gold' | 'silver' | 'community';
	sortOrder: number;
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const client = adminApi(cookies, fetch);

	try {
		// The pickers need the full directories, and the current selection in both
		// languages so a Lao-only talk title is not silently dropped on save.
		const [event, speakersLo, speakersEn, eventSponsors, allSpeakers, allSponsors] =
			await Promise.all([
				client.get<{ id: string; slug: string; translations: { locale: string; title: string }[] }>(
					`/admin/events/${params.id}`
				),
				client.get<EventSpeakerRow[]>(`/admin/events/${params.id}/speakers?locale=lo`),
				client.get<EventSpeakerRow[]>(`/admin/events/${params.id}/speakers?locale=en`),
				client.get<EventSponsorRow[]>(`/admin/events/${params.id}/sponsors`),
				client.get<
					{ id: string; slug: string; translations: { locale: string; name: string }[] }[]
				>('/admin/speakers'),
				client.get<
					{ id: string; name: string; logoUrl: string; tier: EventSponsorRow['tier'] }[]
				>('/admin/sponsors')
			]);

		return { event, speakersLo, speakersEn, eventSponsors, allSpeakers, allSponsors };
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};

export const actions: Actions = {
	speakers: async ({ request, params, cookies, fetch }) => {
		const parsed = setEventSpeakersInputSchema.safeParse(
			parseEventSpeakersForm(await request.formData())
		);
		if (!parsed.success) return fail(400, { message: 'Could not save the line-up' });

		try {
			await adminApi(cookies, fetch).put(`/admin/events/${params.id}/speakers`, parsed.data);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		return { message: 'Line-up saved.' };
	},

	sponsors: async ({ request, params, cookies, fetch }) => {
		const parsed = setEventSponsorsInputSchema.safeParse(
			parseEventSponsorsForm(await request.formData())
		);
		if (!parsed.success) return fail(400, { message: 'Could not save the sponsors' });

		try {
			await adminApi(cookies, fetch).put(`/admin/events/${params.id}/sponsors`, parsed.data);
		} catch (error_) {
			if (isDomainError(error_)) return fail(400, { message: error_.message });
			throw error_;
		}
		return { message: 'Sponsors saved.' };
	}
};
