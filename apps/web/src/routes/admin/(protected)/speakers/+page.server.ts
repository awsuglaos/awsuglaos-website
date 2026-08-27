import { adminApi } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export interface AdminSpeaker {
	id: string;
	slug: string;
	photoUrl: string | null;
	company: string | null;
	communityRole: 'none' | 'leader' | 'co_leader' | 'organiser';
	sortOrder: number;
	translations: { locale: 'lo' | 'en'; name: string; title: string | null }[];
}

export const load: PageServerLoad = async ({ cookies, fetch }) => ({
	speakers: await adminApi(cookies, fetch).get<AdminSpeaker[]>('/admin/speakers')
});
