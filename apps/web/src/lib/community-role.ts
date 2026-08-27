import type { CommunityRole } from '@awsug/shared';

/**
 * Backoffice labels for community roles. English only, like the rest of the
 * backoffice — the public side reads these out of `$lib/paraglide/messages`
 * instead, because they are visitor-facing there and must be bilingual.
 */
export const COMMUNITY_ROLE_LABEL: Record<CommunityRole, string> = {
	none: 'Not on the team',
	leader: 'Leader',
	co_leader: 'Co-leader',
	organiser: 'Organiser'
};
