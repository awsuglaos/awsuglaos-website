import { adminApi } from '$lib/server/admin';
import { isDomainError } from '@awsug/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface Registrant {
	id: string;
	fullName: string;
	email: string;
	phone: string | null;
	organisation: string | null;
	ticketCode: string;
	checkedInAt: string | null;
	createdAt: string;
}

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const client = adminApi(cookies, fetch);

	try {
		const [event, registrations, stats] = await Promise.all([
			client.get<{ id: string; slug: string; translations: { locale: string; title: string }[] }>(
				`/admin/events/${params.id}`
			),
			client.get<Registrant[]>(`/admin/events/${params.id}/registrations`),
			client.get<{ registered: number; checkedIn: number; checkInRate: number }>(
				`/admin/events/${params.id}/stats`
			)
		]);

		return { event, registrations, stats };
	} catch (err) {
		if (isDomainError(err) && err.status === 404) error(404, 'Event not found');
		throw err;
	}
};
