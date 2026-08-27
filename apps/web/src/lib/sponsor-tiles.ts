import type { SponsorTier } from '@awsug/shared';

/**
 * How large a sponsor's logo is drawn, by tier.
 *
 * The logo is given a **fixed height** and a free width, not a pair of maximums.
 * That distinction is the whole point:
 *
 * - A `max-height` only ever shrinks. An artwork smaller than the cap renders
 *   at its own natural size, so a 100px PNG stayed 100px however generous the
 *   cap was — which is exactly how a sponsor row ends up looking undersized no
 *   matter what the numbers say. A fixed height scales *up* as well as down, so
 *   every mark lands at the same optical weight whatever it was exported at.
 * - `w-auto` leaves the aspect ratio alone. Square badges, 4:3, 16:9 and long
 *   horizontal lockups all set their own width from that one height, so nothing
 *   is letterboxed into a shape it was not drawn for and nothing is squashed.
 *
 * `max-w` is only a runaway guard: a very wide lockup is clamped, and
 * `object-contain` then fits it inside that width without distorting it. It is
 * a backstop, not the thing doing the sizing.
 *
 * Tier drives the height because that is what a tier buys. Platinum reading
 * visibly larger than Community is the difference between a sponsor list and a
 * sponsor hierarchy.
 *
 * Shared by the landing page and the event page so the two cannot drift — they
 * did, at `max-w-36` and `max-w-32`, for no reason anyone chose.
 */
export const SPONSOR_TILE: Record<SponsorTier, { tile: string; logo: string }> = {
	// Tile height, then the logo height inside it. The gap between the two is the
	// breathing room, and it stays proportional as the tier steps down.
	platinum: { tile: 'h-32 px-8', logo: 'h-24 max-w-80' },
	gold: { tile: 'h-28 px-8', logo: 'h-20 max-w-72' },
	silver: { tile: 'h-26 px-7', logo: 'h-18 max-w-64' },
	community: { tile: 'h-24 px-6', logo: 'h-16 max-w-56' }
};

/** Classes for the bordered tile a logo sits in. */
export function sponsorTileClass(tier: SponsorTier): string {
	return SPONSOR_TILE[tier].tile;
}

/**
 * Classes for the logo itself. Always paired with `w-auto object-contain` —
 * `w-auto` is what keeps the aspect ratio free, and must not be overridden.
 */
export function sponsorLogoClass(tier: SponsorTier): string {
	return SPONSOR_TILE[tier].logo;
}
