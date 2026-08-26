CREATE TABLE "site_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120),
	"email" varchar(254),
	"subject" varchar(200),
	"message" text NOT NULL,
	"rating" smallint,
	"locale" text DEFAULT 'lo' NOT NULL,
	"event_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_feedback_status_valid" CHECK ("status" in ('pending', 'approved', 'archived')),
	CONSTRAINT "site_feedback_locale_valid" CHECK ("locale" in ('lo', 'en')),
	CONSTRAINT "site_feedback_rating_in_range" CHECK ("site_feedback"."rating" IS NULL OR "site_feedback"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "full_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "form_schema" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_feedback_status_created_idx" ON "site_feedback" USING btree ("status","created_at");
--> statement-breakpoint
/*
 * Backfill. Everything below preserves what the site did before the form
 * builder existed, so no attendee sees a changed registration form and no
 * organiser loses a column of answers.
 *
 * 1. Every existing event gets the four-field form it already had, byte for
 *    byte the DEFAULT_FORM_BLOCKS constant in packages/shared/src/schemas/form.ts.
 */
UPDATE "events"
SET "form_schema" = '[{"kind":"question","id":"fullName","type":"shortText","label":"Full name","help":null,"placeholder":null,"required":true,"role":"name","options":[],"min":null,"max":null},{"kind":"question","id":"email","type":"email","label":"Email address","help":null,"placeholder":null,"required":true,"role":"email","options":[],"min":null,"max":null},{"kind":"question","id":"phone","type":"phone","label":"Phone","help":null,"placeholder":"020 XXXXXXXX","required":false,"role":"phone","options":[],"min":null,"max":null},{"kind":"question","id":"organisation","type":"shortText","label":"Organisation","help":null,"placeholder":null,"required":false,"role":"organisation","options":[],"min":null,"max":null}]'::jsonb
WHERE "form_schema" = '[]'::jsonb;--> statement-breakpoint
/*
 * 2. Every existing registration gets an `answers` object keyed by those same
 *    four block ids, copied out of the columns that used to be the only place
 *    the data lived. Without this the analytics page would report every past
 *    registration as having answered nothing.
 *
 *    Nulls are kept rather than stripped, so a row written before the builder
 *    and a row written after it have the same shape.
 */
UPDATE "registrations"
SET "answers" = jsonb_build_object(
	'fullName', "full_name",
	'email', "email",
	'phone', "phone",
	'organisation', "organisation"
)
WHERE "answers" = '{}'::jsonb;
