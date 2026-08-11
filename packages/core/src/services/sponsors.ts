import { eventSponsors, sponsors, type EventSponsor, type Sponsor } from '@awsug/db';
import {
	NotFoundError,
	SPONSOR_TIER_ORDER,
	type SetEventSponsorsInput,
	type SponsorInput,
	type SponsorTier
} from '@awsug/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { currentTime, type AppContext } from '../context.js';

/** Platinum first regardless of how the enum happens to be stored. */
function tierRank(column: typeof sponsors.tier | typeof eventSponsors.tier) {
	return sql`array_position(ARRAY[${sql.join(
		SPONSOR_TIER_ORDER.map((t) => sql`${t}`),
		sql`, `
	)}]::text[], ${column}::text)`;
}

export async function listSponsors(ctx: AppContext): Promise<Sponsor[]> {
	return ctx.db
		.select()
		.from(sponsors)
		.orderBy(tierRank(sponsors.tier), asc(sponsors.sortOrder), asc(sponsors.name));
}

export async function getSponsorById(ctx: AppContext, id: string): Promise<Sponsor> {
	const [row] = await ctx.db.select().from(sponsors).where(eq(sponsors.id, id)).limit(1);
	if (!row) throw new NotFoundError('Sponsor');
	return row;
}

export async function createSponsor(ctx: AppContext, input: SponsorInput): Promise<Sponsor> {
	const [row] = await ctx.db
		.insert(sponsors)
		.values({
			name: input.name,
			logoUrl: input.logoUrl,
			websiteUrl: input.websiteUrl || null,
			tier: input.tier,
			sortOrder: input.sortOrder
		})
		.returning();
	if (!row) throw new Error('Sponsor insert returned no row');
	return row;
}

export async function updateSponsor(
	ctx: AppContext,
	id: string,
	input: SponsorInput
): Promise<Sponsor> {
	const [row] = await ctx.db
		.update(sponsors)
		.set({
			name: input.name,
			logoUrl: input.logoUrl,
			websiteUrl: input.websiteUrl || null,
			tier: input.tier,
			sortOrder: input.sortOrder,
			updatedAt: currentTime(ctx)
		})
		.where(eq(sponsors.id, id))
		.returning();
	if (!row) throw new NotFoundError('Sponsor');
	return row;
}

export async function deleteSponsor(ctx: AppContext, id: string): Promise<void> {
	const deleted = await ctx.db
		.delete(sponsors)
		.where(eq(sponsors.id, id))
		.returning({ id: sponsors.id });
	if (deleted.length === 0) throw new NotFoundError('Sponsor');
}

/* -------------------------------------------------------------------------- */
/* Sponsors of a specific event                                               */
/* -------------------------------------------------------------------------- */

/** A sponsor as shown on an event page — tier is that event's, not the global one. */
export interface EventSponsorView {
	sponsorId: string;
	name: string;
	logoUrl: string;
	websiteUrl: string | null;
	/** This event's tier, which may differ from the sponsor's group-wide tier. */
	tier: SponsorTier;
	sortOrder: number;
}

export async function listEventSponsors(
	ctx: AppContext,
	eventId: string
): Promise<EventSponsorView[]> {
	const rows = await ctx.db
		.select({
			sponsorId: sponsors.id,
			name: sponsors.name,
			logoUrl: sponsors.logoUrl,
			websiteUrl: sponsors.websiteUrl,
			tier: eventSponsors.tier,
			sortOrder: eventSponsors.sortOrder
		})
		.from(eventSponsors)
		.innerJoin(sponsors, eq(sponsors.id, eventSponsors.sponsorId))
		.where(eq(eventSponsors.eventId, eventId))
		.orderBy(tierRank(eventSponsors.tier), asc(eventSponsors.sortOrder), asc(sponsors.name));

	return rows;
}

/**
 * Replaces an event's sponsor list wholesale, like the speaker line-up.
 *
 * Writes only to `event_sponsors` — the sponsor records themselves are never
 * touched, so setting a company to Gold for one meetup leaves its group-wide
 * tier, and the landing page, exactly as they were.
 */
export async function setEventSponsors(
	ctx: AppContext,
	eventId: string,
	input: SetEventSponsorsInput
): Promise<EventSponsor[]> {
	return ctx.db.transaction(async (tx) => {
		const existing = await tx
			.select({ id: eventSponsors.id })
			.from(eventSponsors)
			.where(eq(eventSponsors.eventId, eventId));

		if (existing.length > 0) {
			await tx.delete(eventSponsors).where(
				inArray(
					eventSponsors.id,
					existing.map((e) => e.id)
				)
			);
		}

		if (input.sponsors.length === 0) return [];

		return tx
			.insert(eventSponsors)
			.values(
				input.sponsors.map((s, index) => ({
					eventId,
					sponsorId: s.sponsorId,
					tier: s.tier,
					sortOrder: s.sortOrder ?? index
				}))
			)
			.returning();
	});
}
