import type { SponsorTier } from '@awsug/shared';

/**
 * How large a sponsor's logo is drawn, by tier.
 *
 * The logo takes a **fixed height** and a free width. A fixed height scales up
 * as well as down, so every mark lands at the same optical weight whatever it
 * was exported at; `w-auto` leaves the aspect ratio alone, so square badges,
 * 4:3, 16:9 and long horizontal lockups each set their own width from that one
 * height. `max-w` is only a runaway guard for very wide artwork, with
 * `object-contain` fitting it inside undistorted.
 *
 * A caveat these numbers cannot fix, and which is usually the real reason a
 * sponsor row looks weak: this sizes the *canvas*, and what a reader sees is
 * the *ink*. Every logo currently on the site is a wide wordmark padded into a
 * 1:1 canvas — Laosway's mark is 3.9:1 and occupies 20% of its own image
 * height, so at a 64px canvas it draws 13px tall no matter how much room the
 * tile gives it. Trimming the transparent margin out of the source PNG is what
 * fixes that, and it is worth ~5x here. Prefer artwork cropped to the mark.
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
	platinum: { tile: 'h-36 px-8', logo: 'h-28 max-w-80' },
	gold: { tile: 'h-32 px-8', logo: 'h-24 max-w-72' },
	silver: { tile: 'h-30 px-7', logo: 'h-22 max-w-64' },
	community: { tile: 'h-28 px-6', logo: 'h-20 max-w-56' }
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
