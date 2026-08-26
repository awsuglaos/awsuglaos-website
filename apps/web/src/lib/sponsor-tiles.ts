import type { SponsorTier } from '@awsug/shared';

/**
 * How large a sponsor's logo is drawn, by tier.
 *
 * The tile is height-constrained and the logo is capped on *both* axes with
 * `object-contain`, rather than being given a fixed height. Sponsor marks
 * arrive in two shapes — a squarish badge and a wide horizontal lockup — and a
 * fixed `h-8` sizes for the badge, which leaves a lockup shrunk to a sliver of
 * text inside a mostly empty box. Capping the height *and* the width lets each
 * shape grow until whichever dimension binds first, so both fill the tile.
 *
 * Tier drives the size because that is what a tier buys. Platinum reading
 * visibly larger than Community is the difference between a sponsor list and a
 * sponsor hierarchy.
 *
 * Shared by the landing page and the event page so the two cannot drift — they
 * did, at `max-w-36` and `max-w-32`, for no reason anyone chose.
 */
export const SPONSOR_TILE: Record<SponsorTier, { tile: string; logo: string }> = {
	platinum: { tile: 'h-24 px-8', logo: 'max-h-14 max-w-56' },
	gold: { tile: 'h-22 px-7', logo: 'max-h-12 max-w-48' },
	silver: { tile: 'h-20 px-6', logo: 'max-h-11 max-w-44' },
	community: { tile: 'h-18 px-6', logo: 'max-h-10 max-w-40' }
};

/** Classes for the bordered tile a logo sits in. */
export function sponsorTileClass(tier: SponsorTier): string {
	return SPONSOR_TILE[tier].tile;
}

/** Classes for the logo itself. Always paired with `w-auto object-contain`. */
export function sponsorLogoClass(tier: SponsorTier): string {
	return SPONSOR_TILE[tier].logo;
}
