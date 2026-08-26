import {
	LOCALES,
	publishStatusSchema,
	sponsorTierSchema,
	userRoleSchema,
	type Locale,
	type PublishStatus,
	type RichTextDoc,
	type SponsorTier,
	type UserRole
} from '@awsug/shared';
import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * These were Postgres enum types. They are plain text with a CHECK constraint
 * instead, because Aurora is reached over the RDS Data API and the Data API
 * sends every string parameter as `text` — Drizzle maps only date, decimal,
 * json, time, timestamp and uuid to an AWS type hint, and no enum hint exists
 * to map to. So `where status = 'published'` fails on Aurora with
 *
 *   operator does not exist: publish_status = text
 *
 * while working perfectly against local Postgres, which infers the type over
 * the extended protocol. No test running on the local driver can catch that.
 * `text = text` behaves identically on both.
 *
 * The permitted values come from the Zod schemas rather than being retyped
 * here, so the database constraint and the application validation cannot drift.
 */
const oneOf = (column: string, values: readonly string[]) =>
	sql.raw(`"${column}" in (${values.map((value) => `'${value}'`).join(', ')})`);

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Authentication lives entirely in Cognito — this table holds only the
 * application-side profile. `cognitoSub` stays null until the user first signs
 * in, which lets an admin pre-create an account by email address.
 */
export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		cognitoSub: varchar('cognito_sub', { length: 64 }).unique(),
		email: varchar('email', { length: 254 }).notNull().unique(),
		name: varchar('name', { length: 160 }).notNull(),
		/** Uploaded through the same S3 path as every other image. */
		avatarUrl: text('avatar_url'),
		role: text('role').$type<UserRole>().notNull().default('editor'),
		...timestamps
	},
	() => [check('users_role_valid', oneOf('role', userRoleSchema.options))]
);

/* -------------------------------------------------------------------------- */
/* Articles                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Translatable content is split into a `*_translations` table rather than
 * per-locale columns, so an article that exists in only one language does not
 * carry a row of NULLs — and Phase 3's Amazon Translate integration can insert
 * a new locale row without a migration.
 *
 * The slug stays on the parent and stays ASCII: one shareable URL per article,
 * not one per language.
 */
export const articles = pgTable(
	'articles',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		slug: varchar('slug', { length: 120 }).notNull().unique(),
		coverImageUrl: text('cover_image_url'),
		category: varchar('category', { length: 60 }),
		status: text('status').$type<PublishStatus>().notNull().default('draft'),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
		...timestamps
	},
	() => [check('articles_status_valid', oneOf('status', publishStatusSchema.options))]
);

export const articleTranslations = pgTable(
	'article_translations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		articleId: uuid('article_id')
			.notNull()
			.references(() => articles.id, { onDelete: 'cascade' }),
		locale: text('locale').$type<Locale>().notNull(),
		title: varchar('title', { length: 200 }).notNull(),
		excerpt: varchar('excerpt', { length: 320 }),
		/**
		 * A TipTap document, stored as JSON rather than HTML. Keeping the structure
		 * means it can be re-rendered, sanitised on the way out, and edited without
		 * round-tripping through a parser — and nothing an editor types is ever
		 * markup until the renderer says so.
		 */
		content: jsonb('content').$type<RichTextDoc>().notNull()
	},
	(t) => [
		uniqueIndex('article_translations_article_locale_uq').on(t.articleId, t.locale),
		check('article_translations_locale_valid', oneOf('locale', LOCALES))
	]
);

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `registeredCount` is denormalised so capacity can be claimed with a single
 * atomic UPDATE (see packages/core/src/services/registrations.ts) instead of a
 * read-then-write that races under load. The CHECK constraint is the backstop:
 * even a buggy write path cannot oversell the room.
 *
 * `capacity = 0` means unlimited.
 */
export const events = pgTable(
	'events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		slug: varchar('slug', { length: 120 }).notNull().unique(),
		startAt: timestamp('start_at', { withTimezone: true }).notNull(),
		endAt: timestamp('end_at', { withTimezone: true }).notNull(),
		/** Always a Google Maps URL — short links are resolved before storage. */
		locationUrl: text('location_url').notNull(),
		/**
		 * Parsed out of `locationUrl` once, at save time, rather than on every
		 * render. Null when the link carried no coordinates (a bare place name),
		 * in which case the embed falls back to a text query.
		 */
		locationLat: doublePrecision('location_lat'),
		locationLng: doublePrecision('location_lng'),
		capacity: integer('capacity').notNull().default(0),
		registeredCount: integer('registered_count').notNull().default(0),
		coverImageUrl: text('cover_image_url'),
		status: text('status').$type<PublishStatus>().notNull().default('draft'),
		...timestamps
	},
	(t) => [
		index('events_start_at_idx').on(t.startAt),
		check('events_end_after_start', sql`${t.endAt} > ${t.startAt}`),
		check('events_capacity_non_negative', sql`${t.capacity} >= 0`),
		check(
			'events_within_capacity',
			sql`${t.capacity} = 0 OR ${t.registeredCount} <= ${t.capacity}`
		),
		check('events_status_valid', oneOf('status', publishStatusSchema.options))
	]
);

export const eventTranslations = pgTable(
	'event_translations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		locale: text('locale').$type<Locale>().notNull(),
		title: varchar('title', { length: 200 }).notNull(),
		/** TipTap document — see the note on articleTranslations.content. */
		description: jsonb('description').$type<RichTextDoc>().notNull(),
		locationName: varchar('location_name', { length: 200 }).notNull()
	},
	(t) => [
		uniqueIndex('event_translations_event_locale_uq').on(t.eventId, t.locale),
		check('event_translations_locale_valid', oneOf('locale', LOCALES))
	]
);

/* -------------------------------------------------------------------------- */
/* Registrations                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `ticketCode` is the QR payload. We store the code, not a rendered PNG in S3 —
 * the image is generated on demand, so tickets can be re-issued and there are no
 * orphaned objects to clean up.
 */
export const registrations = pgTable(
	'registrations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		fullName: varchar('full_name', { length: 120 }).notNull(),
		email: varchar('email', { length: 254 }).notNull(),
		phone: varchar('phone', { length: 20 }),
		organisation: varchar('organisation', { length: 160 }),
		ticketCode: varchar('ticket_code', { length: 32 }).notNull().unique(),
		checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// One registration per email per event. Lower-cased at the index level so a
		// direct DB write cannot bypass the normalisation the Zod schema applies.
		uniqueIndex('registrations_event_email_uq').on(t.eventId, sql`lower(${t.email})`),
		index('registrations_event_idx').on(t.eventId)
	]
);

/* -------------------------------------------------------------------------- */
/* Sponsors & newsletter                                                      */
/* -------------------------------------------------------------------------- */

export const sponsors = pgTable(
	'sponsors',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', { length: 160 }).notNull(),
		logoUrl: text('logo_url').notNull(),
		websiteUrl: text('website_url'),
		tier: text('tier').$type<SponsorTier>().notNull().default('community'),
		sortOrder: integer('sort_order').notNull().default(0),
		...timestamps
	},
	(t) => [
		index('sponsors_tier_sort_idx').on(t.tier, t.sortOrder),
		check('sponsors_tier_valid', oneOf('tier', sponsorTierSchema.options))
	]
);

/* -------------------------------------------------------------------------- */
/* Speakers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Speakers are reusable people, not per-event text. A speaker who returns for a
 * second meetup keeps one profile — their bio is written once, and correcting a
 * typo fixes it everywhere it has ever appeared.
 */
export const speakers = pgTable('speakers', {
	id: uuid('id').primaryKey().defaultRandom(),
	slug: varchar('slug', { length: 120 }).notNull().unique(),
	photoUrl: text('photo_url'),
	company: varchar('company', { length: 160 }),
	websiteUrl: text('website_url'),
	linkedinUrl: text('linkedin_url'),
	githubUrl: text('github_url'),
	...timestamps
});

export const speakerTranslations = pgTable(
	'speaker_translations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		speakerId: uuid('speaker_id')
			.notNull()
			.references(() => speakers.id, { onDelete: 'cascade' }),
		locale: text('locale').$type<Locale>().notNull(),
		// Name is translated too: a Lao speaker is written in Lao script on the
		// Lao page and transliterated on the English one.
		name: varchar('name', { length: 160 }).notNull(),
		title: varchar('title', { length: 160 }),
		bio: text('bio')
	},
	(t) => [
		uniqueIndex('speaker_translations_speaker_locale_uq').on(t.speakerId, t.locale),
		check('speaker_translations_locale_valid', oneOf('locale', LOCALES))
	]
);

/** Join: which speakers appear at which event, and in what order. */
export const eventSpeakers = pgTable(
	'event_speakers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		speakerId: uuid('speaker_id')
			.notNull()
			.references(() => speakers.id, { onDelete: 'cascade' }),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(t) => [
		uniqueIndex('event_speakers_event_speaker_uq').on(t.eventId, t.speakerId),
		index('event_speakers_event_sort_idx').on(t.eventId, t.sortOrder)
	]
);

/** The talk itself belongs to the appearance, not to the person. */
export const eventSpeakerTranslations = pgTable(
	'event_speaker_translations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventSpeakerId: uuid('event_speaker_id')
			.notNull()
			.references(() => eventSpeakers.id, { onDelete: 'cascade' }),
		locale: text('locale').$type<Locale>().notNull(),
		talkTitle: varchar('talk_title', { length: 200 }),
		abstract: text('abstract')
	},
	(t) => [
		uniqueIndex('event_speaker_translations_locale_uq').on(t.eventSpeakerId, t.locale),
		check('event_speaker_translations_locale_valid', oneOf('locale', LOCALES))
	]
);

/* -------------------------------------------------------------------------- */
/* Event sponsors                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Which sponsors backed which event, and at what level.
 *
 * Tier lives here rather than only on `sponsors` because the same company can
 * be Platinum at one event and Gold at the next, while separately holding a
 * group-wide tier shown on the landing page. Were tier only on the sponsor,
 * editing one event would silently restate that company's standing everywhere.
 */
export const eventSponsors = pgTable(
	'event_sponsors',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		sponsorId: uuid('sponsor_id')
			.notNull()
			.references(() => sponsors.id, { onDelete: 'cascade' }),
		tier: text('tier').$type<SponsorTier>().notNull().default('community'),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(t) => [
		uniqueIndex('event_sponsors_event_sponsor_uq').on(t.eventId, t.sponsorId),
		index('event_sponsors_event_tier_idx').on(t.eventId, t.tier, t.sortOrder),
		check('event_sponsors_tier_valid', oneOf('tier', sponsorTierSchema.options))
	]
);

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Post-event feedback, tied to the registration that submitted it.
 *
 * The unique constraint on `registrationId` is what makes one-response-per-
 * ticket a database guarantee rather than a hopeful check in the route. Being
 * linked to a registration also means organisers can follow up on a complaint;
 * `allowPublic` is the attendee's separate consent to quoting them.
 */
export const eventFeedback = pgTable(
	'event_feedback',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		eventId: uuid('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		registrationId: uuid('registration_id')
			.notNull()
			.references(() => registrations.id, { onDelete: 'cascade' }),
		overallRating: smallint('overall_rating').notNull(),
		venueRating: smallint('venue_rating'),
		contentRating: smallint('content_rating'),
		whatWentWell: text('what_went_well'),
		whatToImprove: text('what_to_improve'),
		/** Attendee consent to quoting their comments publicly. */
		allowPublic: boolean('allow_public').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('event_feedback_registration_uq').on(t.registrationId),
		index('event_feedback_event_idx').on(t.eventId),
		check(
			'event_feedback_ratings_in_range',
			sql`${t.overallRating} BETWEEN 1 AND 5
				AND (${t.venueRating} IS NULL OR ${t.venueRating} BETWEEN 1 AND 5)
				AND (${t.contentRating} IS NULL OR ${t.contentRating} BETWEEN 1 AND 5)`
		)
	]
);

export const newsletterSubs = pgTable(
	'newsletter_subs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: varchar('email', { length: 254 }).notNull().unique(),
		locale: text('locale').$type<Locale>().notNull().default('lo'),
		/** Opaque token for one-click unsubscribe links. */
		token: varchar('token', { length: 64 }).notNull().unique(),
		subscribedAt: timestamp('subscribed_at', { withTimezone: true }).notNull().defaultNow(),
		unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true })
	},
	() => [check('newsletter_subs_locale_valid', oneOf('locale', LOCALES))]
);

/* -------------------------------------------------------------------------- */
/* Relations (for the Drizzle query API)                                      */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
	articles: many(articles)
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
	author: one(users, { fields: [articles.authorId], references: [users.id] }),
	translations: many(articleTranslations)
}));

export const articleTranslationsRelations = relations(articleTranslations, ({ one }) => ({
	article: one(articles, {
		fields: [articleTranslations.articleId],
		references: [articles.id]
	})
}));

export const eventsRelations = relations(events, ({ many }) => ({
	translations: many(eventTranslations),
	registrations: many(registrations),
	speakers: many(eventSpeakers),
	sponsors: many(eventSponsors),
	feedback: many(eventFeedback)
}));

export const speakersRelations = relations(speakers, ({ many }) => ({
	translations: many(speakerTranslations),
	appearances: many(eventSpeakers)
}));

export const speakerTranslationsRelations = relations(speakerTranslations, ({ one }) => ({
	speaker: one(speakers, {
		fields: [speakerTranslations.speakerId],
		references: [speakers.id]
	})
}));

export const eventSpeakersRelations = relations(eventSpeakers, ({ one, many }) => ({
	event: one(events, { fields: [eventSpeakers.eventId], references: [events.id] }),
	speaker: one(speakers, { fields: [eventSpeakers.speakerId], references: [speakers.id] }),
	translations: many(eventSpeakerTranslations)
}));

export const eventSpeakerTranslationsRelations = relations(eventSpeakerTranslations, ({ one }) => ({
	eventSpeaker: one(eventSpeakers, {
		fields: [eventSpeakerTranslations.eventSpeakerId],
		references: [eventSpeakers.id]
	})
}));

export const sponsorsRelations = relations(sponsors, ({ many }) => ({
	events: many(eventSponsors)
}));

export const eventSponsorsRelations = relations(eventSponsors, ({ one }) => ({
	event: one(events, { fields: [eventSponsors.eventId], references: [events.id] }),
	sponsor: one(sponsors, { fields: [eventSponsors.sponsorId], references: [sponsors.id] })
}));

export const eventFeedbackRelations = relations(eventFeedback, ({ one }) => ({
	event: one(events, { fields: [eventFeedback.eventId], references: [events.id] }),
	registration: one(registrations, {
		fields: [eventFeedback.registrationId],
		references: [registrations.id]
	})
}));

export const eventTranslationsRelations = relations(eventTranslations, ({ one }) => ({
	event: one(events, { fields: [eventTranslations.eventId], references: [events.id] })
}));

export const registrationsRelations = relations(registrations, ({ one }) => ({
	event: one(events, { fields: [registrations.eventId], references: [events.id] })
}));

/* -------------------------------------------------------------------------- */
/* Row types                                                                  */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type ArticleTranslation = typeof articleTranslations.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventTranslation = typeof eventTranslations.$inferSelect;
export type RegistrationRow = typeof registrations.$inferSelect;
export type Sponsor = typeof sponsors.$inferSelect;
export type NewsletterSub = typeof newsletterSubs.$inferSelect;
export type Speaker = typeof speakers.$inferSelect;
export type SpeakerTranslation = typeof speakerTranslations.$inferSelect;
export type EventSpeaker = typeof eventSpeakers.$inferSelect;
export type EventSpeakerTranslation = typeof eventSpeakerTranslations.$inferSelect;
export type EventSponsor = typeof eventSponsors.$inferSelect;
export type EventFeedback = typeof eventFeedback.$inferSelect;
export type NewEventFeedback = typeof eventFeedback.$inferInsert;
