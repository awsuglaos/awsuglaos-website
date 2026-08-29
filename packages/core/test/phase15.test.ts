import { users } from '@awsug/db';
import {
	EMPTY_DOC,
	FeedbackAlreadySubmittedError,
	FeedbackNotOpenError,
	LastAdminError,
	NotFoundError,
	SelfRoleChangeError,
	UserExistsError,
	plainTextToRichText
} from '@awsug/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalUserDirectory } from '../src/directory/local.js';
import * as eventService from '../src/services/events.js';
import * as feedbackService from '../src/services/feedback.js';
import * as registrationService from '../src/services/registrations.js';
import * as speakerService from '../src/services/speakers.js';
import * as sponsorService from '../src/services/sponsors.js';
import * as userService from '../src/services/users.js';
import { futureEvent, getTestDb, makeContext } from './helpers.js';

function speaker(overrides: Record<string, unknown> = {}) {
	return {
		slug: 'test-speaker',
		photoUrl: '',
		company: 'Example Co',
		// Both carry Zod defaults, so SpeakerInput has them as required — the
		// fixture has to supply what the schema would have filled in.
		communityRole: 'none' as const,
		sortOrder: 0,
		websiteUrl: '',
		linkedinUrl: '',
		githubUrl: '',
		translations: [
			{
				locale: 'lo' as const,
				name: 'ຜູ້ບັນຍາຍ',
				title: 'ວິສະວະກອນ',
				bio: plainTextToRichText('ຊີວະປະຫວັດ')
			},
			{
				locale: 'en' as const,
				name: 'Test Speaker',
				title: 'Engineer',
				bio: plainTextToRichText('Bio')
			}
		],
		...overrides
	};
}

describe('speakers', () => {
	it('attaches a speaker to an event with a per-event talk', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());
		const created = await speakerService.createSpeaker(ctx, speaker());

		await speakerService.setEventSpeakers(ctx, event.id, {
			speakers: [
				{
					speakerId: created.id,
					sortOrder: 0,
					translations: [
						{ locale: 'lo', talkTitle: 'ຫົວຂໍ້ລາວ', abstract: 'ຫຍໍ້ລາວ' },
						{ locale: 'en', talkTitle: 'English talk', abstract: 'English abstract' }
					]
				}
			]
		});

		const en = await speakerService.listEventSpeakers(ctx, event.id, 'en');
		expect(en).toHaveLength(1);
		expect(en[0]?.name).toBe('Test Speaker');
		expect(en[0]?.talkTitle).toBe('English talk');

		const lo = await speakerService.listEventSpeakers(ctx, event.id, 'lo');
		expect(lo[0]?.name).toBe('ຜູ້ບັນຍາຍ');
		expect(lo[0]?.talkTitle).toBe('ຫົວຂໍ້ລາວ');
	});

	it('falls back to the base locale for a speaker with no English profile', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());
		const created = await speakerService.createSpeaker(
			ctx,
			speaker({
				translations: [{ locale: 'lo' as const, name: 'ມີແຕ່ລາວ', title: '', bio: EMPTY_DOC }]
			})
		);

		await speakerService.setEventSpeakers(ctx, event.id, {
			speakers: [{ speakerId: created.id, sortOrder: 0, translations: [] }]
		});

		const en = await speakerService.listEventSpeakers(ctx, event.id, 'en');
		expect(en[0]?.name).toBe('ມີແຕ່ລາວ');
	});

	it('replaces the line-up wholesale and keeps the given order', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());
		const first = await speakerService.createSpeaker(ctx, speaker({ slug: 'first' }));
		const second = await speakerService.createSpeaker(ctx, speaker({ slug: 'second' }));

		await speakerService.setEventSpeakers(ctx, event.id, {
			speakers: [
				{ speakerId: first.id, sortOrder: 0, translations: [] },
				{ speakerId: second.id, sortOrder: 1, translations: [] }
			]
		});

		// Re-saving with only the second speaker must drop the first, not append.
		await speakerService.setEventSpeakers(ctx, event.id, {
			speakers: [{ speakerId: second.id, sortOrder: 0, translations: [] }]
		});

		const lineup = await speakerService.listEventSpeakers(ctx, event.id, 'en');
		expect(lineup).toHaveLength(1);
		expect(lineup[0]?.speakerId).toBe(second.id);
	});

	/**
	 * A bio is a TipTap document, and the three shapes it is read back in each
	 * have a job: the document for the editor, sanitised markup for the profile
	 * page, and flat text for the meta description and the line-up card.
	 */
	it('renders a rich bio as sanitised markup and as flat text', async () => {
		const ctx = await makeContext();
		const bio = {
			type: 'doc' as const,
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'About me' }] },
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							marks: [{ type: 'link', attrs: { href: 'https://example.la' } }],
							text: 'My site'
						}
					]
				}
			]
		};

		await speakerService.createSpeaker(
			ctx,
			speaker({
				slug: 'rich-bio',
				translations: [{ locale: 'lo' as const, name: 'ຊີວະປະຫວັດ', title: '', bio }]
			})
		);

		const profile = await speakerService.getSpeakerBySlug(ctx, 'rich-bio', 'lo');

		expect(profile.bio).toEqual(bio);
		expect(profile.bioHtml).toContain('<h2>About me</h2>');
		// External links are given rel/target by the sanitiser, not by the editor.
		expect(profile.bioHtml).toContain('rel="noopener noreferrer nofollow"');
		// Flat text is what reaches <meta> and JSON-LD, so it must carry no markup.
		expect(profile.bioText).toBe('About me\n\nMy site');
		expect(profile.bioText).not.toContain('<');
	});

	/** An untouched editor posts an empty document; that is not a bio. */
	it('stores an empty bio document as no bio at all', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());
		const created = await speakerService.createSpeaker(
			ctx,
			speaker({
				slug: 'no-bio',
				translations: [
					{ locale: 'lo' as const, name: 'ບໍ່ມີຊີວະປະຫວັດ', title: '', bio: EMPTY_DOC }
				]
			})
		);

		const profile = await speakerService.getSpeakerBySlug(ctx, 'no-bio', 'lo');
		expect(profile.bio).toBeNull();
		expect(profile.bioHtml).toBe('');
		expect(profile.bioText).toBe('');

		await speakerService.setEventSpeakers(ctx, event.id, {
			speakers: [{ speakerId: created.id, sortOrder: 0, translations: [] }]
		});

		// The line-up card falls back to the bio when there is no abstract — an
		// empty document must not produce an empty paragraph there.
		const lineup = await speakerService.listEventSpeakers(ctx, event.id, 'lo');
		expect(lineup[0]?.bioText).toBeNull();
	});
});

describe('event sponsors', () => {
	/** The reason tier lives on the join table rather than on the sponsor. */
	it('lets an event tier differ from the sponsor group-wide tier', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());
		const sponsor = await sponsorService.createSponsor(ctx, {
			name: 'Toh-Lao',
			logoUrl: 'https://example.la/logo.png',
			tier: 'silver',
			sortOrder: 0
		});

		await sponsorService.setEventSponsors(ctx, event.id, {
			sponsors: [{ sponsorId: sponsor.id, tier: 'platinum', sortOrder: 0 }]
		});

		const forEvent = await sponsorService.listEventSponsors(ctx, event.id);
		expect(forEvent[0]?.tier).toBe('platinum');

		// The global list — what the landing page reads — is untouched.
		const global = await sponsorService.listSponsors(ctx);
		expect(global[0]?.tier).toBe('silver');
	});

	it('orders event sponsors by tier rank', async () => {
		const ctx = await makeContext();
		const event = await eventService.createEvent(ctx, futureEvent());
		const community = await sponsorService.createSponsor(ctx, {
			name: 'Community Co',
			logoUrl: 'https://example.la/c.png',
			tier: 'community',
			sortOrder: 0
		});
		const platinum = await sponsorService.createSponsor(ctx, {
			name: 'Platinum Co',
			logoUrl: 'https://example.la/p.png',
			tier: 'community',
			sortOrder: 0
		});

		await sponsorService.setEventSponsors(ctx, event.id, {
			sponsors: [
				{ sponsorId: community.id, tier: 'community', sortOrder: 0 },
				{ sponsorId: platinum.id, tier: 'platinum', sortOrder: 0 }
			]
		});

		const listed = await sponsorService.listEventSponsors(ctx, event.id);
		expect(listed.map((s) => s.tier)).toEqual(['platinum', 'community']);
	});
});

describe('feedback', () => {
	async function pastEventWithTicket() {
		const ctx = await makeContext();
		const start = new Date(Date.now() - 3 * 86_400_000);
		const event = await eventService.createEvent(
			ctx,
			futureEvent({
				slug: 'past-event',
				startAt: start,
				endAt: new Date(start.getTime() + 3_600_000)
			})
		);

		// Register while the event is still in the future, then let the clock pass.
		const registerCtx = { ...ctx, now: () => new Date(start.getTime() - 86_400_000) };
		const { registration } = await registrationService.registerForEvent(
			registerCtx,
			'past-event',
			{ answers: { fullName: 'Attendee One', email: 'attendee@example.la' } },
			'en'
		);

		return { ctx, event, ticket: registration.ticketCode };
	}

	it('accepts one response and refuses a second', async () => {
		const { ctx, ticket } = await pastEventWithTicket();

		await feedbackService.submitFeedback(ctx, 'past-event', ticket, {
			overallRating: 5,
			venueRating: 4,
			whatWentWell: 'Great pacing',
			allowPublic: true
		});

		await expect(
			feedbackService.submitFeedback(ctx, 'past-event', ticket, {
				overallRating: 3,
				allowPublic: false
			})
		).rejects.toBeInstanceOf(FeedbackAlreadySubmittedError);
	});

	it('refuses feedback before the event has ended', async () => {
		const ctx = await makeContext();
		await eventService.createEvent(ctx, futureEvent());
		const { registration } = await registrationService.registerForEvent(
			ctx,
			'test-event',
			{ answers: { fullName: 'Early Bird', email: 'early@example.la' } },
			'en'
		);

		await expect(
			feedbackService.submitFeedback(ctx, 'test-event', registration.ticketCode, {
				overallRating: 5,
				allowPublic: false
			})
		).rejects.toBeInstanceOf(FeedbackNotOpenError);
	});

	it('refuses a ticket belonging to a different event', async () => {
		const { ctx, ticket } = await pastEventWithTicket();
		const other = new Date(Date.now() - 5 * 86_400_000);
		await eventService.createEvent(
			ctx,
			futureEvent({
				slug: 'other-event',
				startAt: other,
				endAt: new Date(other.getTime() + 3_600_000)
			})
		);

		await expect(
			feedbackService.submitFeedback(ctx, 'other-event', ticket, {
				overallRating: 5,
				allowPublic: false
			})
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('averages ratings and reports a response rate', async () => {
		const { ctx, event, ticket } = await pastEventWithTicket();

		await feedbackService.submitFeedback(ctx, 'past-event', ticket, {
			overallRating: 4,
			venueRating: 2,
			allowPublic: false
		});

		const averages = await feedbackService.getFeedbackAverages(ctx, event.id);
		expect(averages.responses).toBe(1);
		expect(averages.overall).toBe(4);
		expect(averages.venue).toBe(2);
		expect(averages.content).toBeNull();
		expect(averages.responseRate).toBe(100);
	});
});

describe('user management', () => {
	async function ctxWithDirectory() {
		const directory = new LocalUserDirectory();
		const ctx = await makeContext();
		return { ctx: { ...ctx, directory }, directory };
	}

	async function seedAdmin(ctx: Awaited<ReturnType<typeof makeContext>>) {
		const [row] = await ctx.db
			.insert(users)
			.values({ email: 'admin@example.la', name: 'Admin', role: 'admin' })
			.returning();
		return row!;
	}

	it('invites a user into both the directory and the table', async () => {
		const { ctx, directory } = await ctxWithDirectory();

		const created = await userService.inviteUser(ctx, {
			email: 'editor@example.la',
			name: 'New Editor',
			role: 'editor'
		});

		expect(created.role).toBe('editor');
		expect(directory.invited.map((u) => u.email)).toEqual(['editor@example.la']);
	});

	it('refuses to invite an address that already has an account', async () => {
		const { ctx } = await ctxWithDirectory();
		await userService.inviteUser(ctx, {
			email: 'dup@example.la',
			name: 'First',
			role: 'editor'
		});

		await expect(
			userService.inviteUser(ctx, { email: 'dup@example.la', name: 'Second', role: 'admin' })
		).rejects.toBeInstanceOf(UserExistsError);
	});

	/* The two guards that keep the backoffice from locking itself out. */

	it('refuses to demote the last remaining admin', async () => {
		const { ctx } = await ctxWithDirectory();
		const admin = await seedAdmin(ctx);
		const other = await userService.inviteUser(ctx, {
			email: 'someone@example.la',
			name: 'Someone',
			role: 'editor'
		});

		await expect(
			userService.updateUserRole(ctx, admin.id, 'editor', other.id)
		).rejects.toBeInstanceOf(LastAdminError);
	});

	it('refuses to remove the last remaining admin', async () => {
		const { ctx } = await ctxWithDirectory();
		const admin = await seedAdmin(ctx);
		const other = await userService.inviteUser(ctx, {
			email: 'someone@example.la',
			name: 'Someone',
			role: 'editor'
		});

		await expect(userService.removeUser(ctx, admin.id, other.id)).rejects.toBeInstanceOf(
			LastAdminError
		);
	});

	it('allows demoting an admin once a second one exists', async () => {
		const { ctx } = await ctxWithDirectory();
		const first = await seedAdmin(ctx);
		const second = await userService.inviteUser(ctx, {
			email: 'second-admin@example.la',
			name: 'Second Admin',
			role: 'admin'
		});

		const demoted = await userService.updateUserRole(ctx, first.id, 'editor', second.id);
		expect(demoted.role).toBe('editor');
	});

	it('refuses to let anyone change their own role', async () => {
		const { ctx } = await ctxWithDirectory();
		const admin = await seedAdmin(ctx);

		await expect(
			userService.updateUserRole(ctx, admin.id, 'editor', admin.id)
		).rejects.toBeInstanceOf(SelfRoleChangeError);
		await expect(userService.removeUser(ctx, admin.id, admin.id)).rejects.toBeInstanceOf(
			SelfRoleChangeError
		);
	});

	/**
	 * Profile edits are separate from role edits precisely so this works: you may
	 * always change your own name and photo, even though you may never change
	 * your own role.
	 */
	it('lets a user edit their own name and avatar', async () => {
		const { ctx } = await ctxWithDirectory();
		const admin = await seedAdmin(ctx);

		const updated = await userService.updateUserProfile(ctx, admin.id, {
			name: 'Renamed Admin',
			avatarUrl: 'https://example.la/avatar.png'
		});

		expect(updated.name).toBe('Renamed Admin');
		expect(updated.avatarUrl).toBe('https://example.la/avatar.png');
		// Role is untouched by a profile edit.
		expect(updated.role).toBe('admin');
	});

	it('clears the avatar when the field is emptied', async () => {
		const { ctx } = await ctxWithDirectory();
		const admin = await seedAdmin(ctx);

		await userService.updateUserProfile(ctx, admin.id, {
			name: 'Admin',
			avatarUrl: 'https://example.la/avatar.png'
		});
		const cleared = await userService.updateUserProfile(ctx, admin.id, {
			name: 'Admin',
			avatarUrl: ''
		});

		expect(cleared.avatarUrl).toBeNull();
	});

	it('removes the identity as well as the row', async () => {
		const { ctx, directory } = await ctxWithDirectory();
		await seedAdmin(ctx);
		const target = await userService.inviteUser(ctx, {
			email: 'leaving@example.la',
			name: 'Leaving',
			role: 'editor'
		});
		const [acting] = await ctx.db.select().from(users).where(eq(users.email, 'admin@example.la'));

		await userService.removeUser(ctx, target.id, acting!.id);

		const remaining = await userService.listUsers(ctx);
		expect(remaining.map((u) => u.email)).not.toContain('leaving@example.la');
		expect(directory.removed).toContain('leaving@example.la');
	});
});
