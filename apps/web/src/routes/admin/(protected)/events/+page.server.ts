import { adminApi } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export interface AdminEvent {
	id: string;
	slug: string;
	startAt: string;
	endAt: string;
	capacity: number;
	registeredCount: number;
	status: 'draft' | 'published';
	translations: { locale: 'lo' | 'en'; title: string }[];
}

export const load: PageServerLoad = async ({ cookies, fetch }) => ({
	events: await adminApi(cookies, fetch).get<AdminEvent[]>('/admin/events')
});
