import {
	articleTranslations,
	articles,
	type Article,
	type ArticleTranslation
} from '@awsug/db';
import {
	NotFoundError,
	richTextToPlainText,
	SlugTakenError,
	type ArticleInput,
	type Locale,
	type RichTextDoc
} from '@awsug/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { renderRichText } from '../content/render.js';
import { currentTime, type AppContext } from '../context.js';
import { isUniqueViolation } from '../util/db-errors.js';
import { isFallback, pickTranslation } from '../util/translation.js';

export interface ArticleView {
	id: string;
	slug: string;
	category: string | null;
	coverImageUrl: string | null;
	publishedAt: Date | null;
	title: string;
	excerpt: string | null;
	/** The stored document. */
	content: RichTextDoc;
	/** Sanitised HTML, safe to inject. */
	contentHtml: string;
	/** Flattened text for meta descriptions and search. */
	contentText: string;
	translationFallback: boolean;
}

type ArticleWithTranslations = Article & { translations: ArticleTranslation[] };

function toView(article: ArticleWithTranslations, locale: Locale): ArticleView {
	const t = pickTranslation(article.translations, locale);
	if (!t) throw new NotFoundError('Article translation');

	return {
		id: article.id,
		slug: article.slug,
		category: article.category,
		coverImageUrl: article.coverImageUrl,
		publishedAt: article.publishedAt,
		title: t.title,
		excerpt: t.excerpt,
		content: t.content,
		contentHtml: renderRichText(t.content),
		contentText: richTextToPlainText(t.content),
		translationFallback: isFallback(article.translations, locale)
	};
}

export interface ListArticlesOptions {
	locale: Locale;
	category?: string;
	search?: string;
	limit?: number;
	offset?: number;
}

export async function listPublishedArticles(
	ctx: AppContext,
	options: ListArticlesOptions
): Promise<ArticleView[]> {
	const filters = [eq(articles.status, 'published')];
	if (options.category) filters.push(eq(articles.category, options.category));

	const rows = await ctx.db.query.articles.findMany({
		where: and(...filters),
		orderBy: [desc(articles.publishedAt)],
		...(options.limit === undefined ? {} : { limit: options.limit }),
		...(options.offset === undefined ? {} : { offset: options.offset }),
		with: { translations: true }
	});

	const views = (rows as ArticleWithTranslations[]).map((row) => toView(row, options.locale));

	if (!options.search) return views;

	// Search runs over the resolved translation so it matches what the reader
	// actually sees. At this content volume an in-memory filter is honest and
	// cheap; swap in Postgres full-text search if the archive outgrows it.
	const needle = options.search.toLocaleLowerCase();
	return views.filter((v) =>
		// Searches the flattened text, not the JSON — otherwise a query would
		// match node type names like "paragraph".
		[v.title, v.excerpt ?? '', v.contentText].some((field) =>
			field.toLocaleLowerCase().includes(needle)
		)
	);
}

export async function getPublishedArticleBySlug(
	ctx: AppContext,
	slug: string,
	locale: Locale
): Promise<ArticleView> {
	const row = await ctx.db.query.articles.findFirst({
		where: and(eq(articles.slug, slug), eq(articles.status, 'published')),
		with: { translations: true }
	});
	if (!row) throw new NotFoundError('Article');
	return toView(row as ArticleWithTranslations, locale);
}

export async function listCategories(ctx: AppContext): Promise<string[]> {
	const rows = await ctx.db
		.selectDistinct({ category: articles.category })
		.from(articles)
		.where(and(eq(articles.status, 'published'), sql`${articles.category} IS NOT NULL`));
	return rows.map((r) => r.category).filter((c): c is string => Boolean(c));
}

/* -------------------------------------------------------------------------- */
/* Backoffice                                                                 */
/* -------------------------------------------------------------------------- */

export async function listAllArticles(ctx: AppContext): Promise<ArticleWithTranslations[]> {
	const rows = await ctx.db.query.articles.findMany({
		orderBy: [desc(articles.createdAt)],
		with: { translations: true }
	});
	return rows as ArticleWithTranslations[];
}

export async function getArticleById(
	ctx: AppContext,
	id: string
): Promise<ArticleWithTranslations> {
	const row = await ctx.db.query.articles.findFirst({
		where: eq(articles.id, id),
		with: { translations: true }
	});
	if (!row) throw new NotFoundError('Article');
	return row as ArticleWithTranslations;
}

export async function createArticle(
	ctx: AppContext,
	input: ArticleInput,
	authorId: string | null
): Promise<ArticleWithTranslations> {
	const { translations, ...row } = input;
	const now = currentTime(ctx);

	return ctx.db.transaction(async (tx) => {
		let created: Article | undefined;
		try {
			[created] = await tx
				.insert(articles)
				.values({
					slug: row.slug,
					category: row.category || null,
					coverImageUrl: row.coverImageUrl || null,
					status: row.status,
					// publishedAt is stamped on the transition to published, so the
					// listing order reflects when a post actually went live.
					publishedAt: row.status === 'published' ? now : null,
					authorId
				})
				.returning();
		} catch (error) {
			if (isUniqueViolation(error)) throw new SlugTakenError(row.slug);
			throw error;
		}
		if (!created) throw new Error('Article insert returned no row');

		const inserted = await tx
			.insert(articleTranslations)
			.values(translations.map((t) => ({ ...t, articleId: created.id })))
			.returning();

		return { ...created, translations: inserted };
	});
}

export async function updateArticle(
	ctx: AppContext,
	id: string,
	input: ArticleInput
): Promise<ArticleWithTranslations> {
	const { translations, ...row } = input;
	const now = currentTime(ctx);

	return ctx.db.transaction(async (tx) => {
		const [existing] = await tx.select().from(articles).where(eq(articles.id, id)).limit(1);
		if (!existing) throw new NotFoundError('Article');

		// Keep the original publish date across edits; only stamp it the first
		// time a draft goes live.
		const publishedAt =
			row.status === 'published' ? (existing.publishedAt ?? now) : existing.publishedAt;

		let updated: Article | undefined;
		try {
			[updated] = await tx
				.update(articles)
				.set({
					slug: row.slug,
					category: row.category || null,
					coverImageUrl: row.coverImageUrl || null,
					status: row.status,
					publishedAt,
					updatedAt: now
				})
				.where(eq(articles.id, id))
				.returning();
		} catch (error) {
			if (isUniqueViolation(error)) throw new SlugTakenError(row.slug);
			throw error;
		}
		if (!updated) throw new NotFoundError('Article');

		await tx.delete(articleTranslations).where(eq(articleTranslations.articleId, id));
		const inserted = await tx
			.insert(articleTranslations)
			.values(translations.map((t) => ({ ...t, articleId: id })))
			.returning();

		return { ...updated, translations: inserted };
	});
}

export async function deleteArticle(ctx: AppContext, id: string): Promise<void> {
	const deleted = await ctx.db
		.delete(articles)
		.where(eq(articles.id, id))
		.returning({ id: articles.id });
	if (deleted.length === 0) throw new NotFoundError('Article');
}
