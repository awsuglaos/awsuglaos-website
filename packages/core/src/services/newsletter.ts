import { newsletterSubs, type NewsletterSub } from '@awsug/db';
import {
	BASE_LOCALE,
	NotFoundError,
	generateUnsubscribeToken,
	type NewsletterInput
} from '@awsug/shared';
import { eq } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';
import { newsletterWelcomeEmail } from '../email/templates.js';

function buildUnsubscribeUrl(siteUrl: string, token: string): string {
	return `${siteUrl.replace(/\/$/, '')}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Idempotent by design: re-subscribing an existing address updates the locale
 * and clears any previous unsubscribe rather than erroring, so a visitor who
 * forgets they already signed up sees success instead of a confusing failure.
 */
export async function subscribe(
	ctx: AppContext,
	input: NewsletterInput
): Promise<{ subscription: NewsletterSub; isNew: boolean }> {
	const locale = input.locale ?? BASE_LOCALE;

	const [existing] = await ctx.db
		.select()
		.from(newsletterSubs)
		.where(eq(newsletterSubs.email, input.email))
		.limit(1);

	if (existing) {
		const [updated] = await ctx.db
			.update(newsletterSubs)
			.set({ locale, unsubscribedAt: null })
			.where(eq(newsletterSubs.id, existing.id))
			.returning();
		return { subscription: updated ?? existing, isNew: false };
	}

	const [created] = await ctx.db
		.insert(newsletterSubs)
		.values({ email: input.email, locale, token: generateUnsubscribeToken() })
		.returning();

	if (!created) throw new Error('Newsletter insert returned no row');

	try {
		const template = newsletterWelcomeEmail(
			locale,
			buildUnsubscribeUrl(ctx.siteUrl, created.token)
		);
		await ctx.email.send({ to: created.email, ...template });
	} catch (error) {
		console.error('Newsletter welcome email failed', {
			email: created.email,
			error: error instanceof Error ? error.message : String(error)
		});
	}

	return { subscription: created, isNew: true };
}

export async function unsubscribe(ctx: AppContext, token: string): Promise<void> {
	const [row] = await ctx.db
		.update(newsletterSubs)
		.set({ unsubscribedAt: currentTime(ctx) })
		.where(eq(newsletterSubs.token, token))
		.returning({ id: newsletterSubs.id });

	if (!row) throw new NotFoundError('Subscription');
}

export async function listSubscribers(ctx: AppContext): Promise<NewsletterSub[]> {
	return ctx.db.select().from(newsletterSubs);
}
