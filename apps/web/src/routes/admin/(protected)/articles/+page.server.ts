import { adminApi } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export interface AdminArticle {
	id: string;
	slug: string;
	category: string | null;
	status: 'draft' | 'published';
	publishedAt: string | null;
	createdAt: string;
	translations: { locale: 'lo' | 'en'; title: string }[];
}

export const load: PageServerLoad = async ({ cookies, fetch }) => ({
	articles: await adminApi(cookies, fetch).get<AdminArticle[]>('/admin/articles')
});
