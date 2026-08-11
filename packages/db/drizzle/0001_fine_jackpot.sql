CREATE TABLE "event_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"overall_rating" smallint NOT NULL,
	"venue_rating" smallint,
	"content_rating" smallint,
	"what_went_well" text,
	"what_to_improve" text,
	"allow_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_feedback_ratings_in_range" CHECK ("event_feedback"."overall_rating" BETWEEN 1 AND 5
				AND ("event_feedback"."venue_rating" IS NULL OR "event_feedback"."venue_rating" BETWEEN 1 AND 5)
				AND ("event_feedback"."content_rating" IS NULL OR "event_feedback"."content_rating" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE TABLE "event_speaker_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_speaker_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"talk_title" varchar(200),
	"abstract" text
);
--> statement-breakpoint
CREATE TABLE "event_speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"speaker_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"tier" "sponsor_tier" DEFAULT 'community' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"speaker_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" varchar(160) NOT NULL,
	"title" varchar(160),
	"bio" text
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"photo_url" text,
	"company" varchar(160),
	"website_url" text,
	"linkedin_url" text,
	"github_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speakers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- HAND-EDITED below this line. drizzle-kit emitted three statements that each
-- destroy or fail on existing data:
--
--   ALTER COLUMN "content"      SET DATA TYPE jsonb   -- no implicit text→jsonb cast
--   ALTER COLUMN "description"  SET DATA TYPE jsonb   -- same
--   ALTER COLUMN "location_url" SET NOT NULL          -- fails; some rows are NULL
--
-- They are replaced with add-backfill-swap sequences that carry the existing
-- prose into TipTap documents and give every event a map link first.
-- ---------------------------------------------------------------------------

ALTER TABLE "article_translations" ADD COLUMN "content_doc" jsonb;--> statement-breakpoint
UPDATE "article_translations" AS target
SET "content_doc" = jsonb_build_object('type', 'doc', 'content', source.paragraphs)
FROM (
	SELECT t.id,
	       jsonb_agg(
	         jsonb_build_object(
	           'type', 'paragraph',
	           'content', jsonb_build_array(
	             jsonb_build_object('type', 'text', 'text', btrim(part.value))
	           )
	         )
	         ORDER BY part.ordinality
	       ) AS paragraphs
	FROM "article_translations" t,
	     LATERAL regexp_split_to_table(t."content", E'\n[ \t]*\n') WITH ORDINALITY AS part(value, ordinality)
	WHERE btrim(part.value) <> ''
	GROUP BY t.id
) AS source
WHERE target.id = source.id;--> statement-breakpoint
UPDATE "article_translations" SET "content_doc" = '{"type":"doc","content":[]}'::jsonb WHERE "content_doc" IS NULL;--> statement-breakpoint
ALTER TABLE "article_translations" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "article_translations" RENAME COLUMN "content_doc" TO "content";--> statement-breakpoint
ALTER TABLE "article_translations" ALTER COLUMN "content" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "event_translations" ADD COLUMN "description_doc" jsonb;--> statement-breakpoint
UPDATE "event_translations" AS target
SET "description_doc" = jsonb_build_object('type', 'doc', 'content', source.paragraphs)
FROM (
	SELECT t.id,
	       jsonb_agg(
	         jsonb_build_object(
	           'type', 'paragraph',
	           'content', jsonb_build_array(
	             jsonb_build_object('type', 'text', 'text', btrim(part.value))
	           )
	         )
	         ORDER BY part.ordinality
	       ) AS paragraphs
	FROM "event_translations" t,
	     LATERAL regexp_split_to_table(t."description", E'\n[ \t]*\n') WITH ORDINALITY AS part(value, ordinality)
	WHERE btrim(part.value) <> ''
	GROUP BY t.id
) AS source
WHERE target.id = source.id;--> statement-breakpoint
UPDATE "event_translations" SET "description_doc" = '{"type":"doc","content":[]}'::jsonb WHERE "description_doc" IS NULL;--> statement-breakpoint
ALTER TABLE "event_translations" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "event_translations" RENAME COLUMN "description_doc" TO "description";--> statement-breakpoint
ALTER TABLE "event_translations" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint

-- Every event now needs a map link. Build one from the venue name before the
-- constraint lands, preferring the base-locale translation.
UPDATE "events" AS e
SET "location_url" = 'https://www.google.com/maps/search/?api=1&query=' ||
    replace(replace(btrim(t."location_name"), '&', '%26'), ' ', '+')
FROM "event_translations" t
WHERE t."event_id" = e."id"
  AND t."locale" = 'lo'
  AND e."location_url" IS NULL
  AND btrim(t."location_name") <> '';--> statement-breakpoint
UPDATE "events"
SET "location_url" = 'https://www.google.com/maps/search/?api=1&query=Vientiane%2C+Laos'
WHERE "location_url" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "location_url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_lat" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_lng" double precision;--> statement-breakpoint
ALTER TABLE "event_feedback" ADD CONSTRAINT "event_feedback_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_feedback" ADD CONSTRAINT "event_feedback_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_speaker_translations" ADD CONSTRAINT "event_speaker_translations_event_speaker_id_event_speakers_id_fk" FOREIGN KEY ("event_speaker_id") REFERENCES "public"."event_speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_speakers" ADD CONSTRAINT "event_speakers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_speakers" ADD CONSTRAINT "event_speakers_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_translations" ADD CONSTRAINT "speaker_translations_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_feedback_registration_uq" ON "event_feedback" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "event_feedback_event_idx" ON "event_feedback" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_speaker_translations_locale_uq" ON "event_speaker_translations" USING btree ("event_speaker_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "event_speakers_event_speaker_uq" ON "event_speakers" USING btree ("event_id","speaker_id");--> statement-breakpoint
CREATE INDEX "event_speakers_event_sort_idx" ON "event_speakers" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sponsors_event_sponsor_uq" ON "event_sponsors" USING btree ("event_id","sponsor_id");--> statement-breakpoint
CREATE INDEX "event_sponsors_event_tier_idx" ON "event_sponsors" USING btree ("event_id","tier","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_translations_speaker_locale_uq" ON "speaker_translations" USING btree ("speaker_id","locale");