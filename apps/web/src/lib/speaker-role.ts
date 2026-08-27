import * as m from '$lib/paraglide/messages';
import type { CommunityRole } from '@awsug/shared';

/**
 * The visitor-facing label for a community role, in the current locale.
 *
 * Separate from COMMUNITY_ROLE_LABEL in $lib/community-role, which is the
 * English-only backoffice copy. 'none' has no label because someone who is not
 * on the team never gets a role badge — returning '' rather than a word keeps
 * the caller's `{#if}` honest.
 */
export function roleLabel(role: CommunityRole): string {
	switch (role) {
		case 'leader':
			return m.role_leader();
		case 'co_leader':
			return m.role_co_leader();
		case 'organiser':
			return m.role_organiser();
		default:
			return '';
	}
}
