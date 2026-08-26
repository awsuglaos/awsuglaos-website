-- Enum types -> text + CHECK. The RDS Data API sends string parameters as
-- `text` and has no type hint for enums, so `status = 'published'` fails on
-- Aurora while working on local Postgres. DROP DEFAULT precedes each type
-- change because Postgres refuses to re-cast a default it cannot convert.
ALTER TABLE "article_translations" ALTER COLUMN "locale" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "event_speaker_translations" ALTER COLUMN "locale" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "event_sponsors" ALTER COLUMN "tier" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "event_sponsors" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "event_sponsors" ALTER COLUMN "tier" SET DEFAULT 'community';--> statement-breakpoint
ALTER TABLE "event_translations" ALTER COLUMN "locale" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "newsletter_subs" ALTER COLUMN "locale" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "newsletter_subs" ALTER COLUMN "locale" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "newsletter_subs" ALTER COLUMN "locale" SET DEFAULT 'lo';--> statement-breakpoint
ALTER TABLE "speaker_translations" ALTER COLUMN "locale" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sponsors" ALTER COLUMN "tier" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sponsors" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sponsors" ALTER COLUMN "tier" SET DEFAULT 'community';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'editor';--> statement-breakpoint
ALTER TABLE "article_translations" ADD CONSTRAINT "article_translations_locale_valid" CHECK ("locale" in ('lo', 'en'));--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_status_valid" CHECK ("status" in ('draft', 'published'));--> statement-breakpoint
ALTER TABLE "event_speaker_translations" ADD CONSTRAINT "event_speaker_translations_locale_valid" CHECK ("locale" in ('lo', 'en'));--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_tier_valid" CHECK ("tier" in ('platinum', 'gold', 'silver', 'community'));--> statement-breakpoint
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_locale_valid" CHECK ("locale" in ('lo', 'en'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_status_valid" CHECK ("status" in ('draft', 'published'));--> statement-breakpoint
ALTER TABLE "newsletter_subs" ADD CONSTRAINT "newsletter_subs_locale_valid" CHECK ("locale" in ('lo', 'en'));--> statement-breakpoint
ALTER TABLE "speaker_translations" ADD CONSTRAINT "speaker_translations_locale_valid" CHECK ("locale" in ('lo', 'en'));--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_tier_valid" CHECK ("tier" in ('platinum', 'gold', 'silver', 'community'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_valid" CHECK ("role" in ('admin', 'editor'));--> statement-breakpoint
DROP TYPE "public"."locale";--> statement-breakpoint
DROP TYPE "public"."publish_status";--> statement-breakpoint
DROP TYPE "public"."sponsor_tier";--> statement-breakpoint
DROP TYPE "public"."user_role";