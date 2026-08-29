-- ---------------------------------------------------------------------------
-- HAND-EDITED. drizzle-kit emitted one statement that fails on existing data:
--
--   ALTER COLUMN "bio" SET DATA TYPE jsonb   -- no implicit text→jsonb cast
--
-- It is replaced with the add-backfill-swap sequence 0001 used for article
-- content and event descriptions, carrying the existing prose into TipTap
-- documents.
--
-- Two deliberate differences from 0001. The column stays nullable — a profile
-- with no bio is normal, and NULL is what every `{#if bio}` guard reads — so
-- rows that were NULL or blank are left alone rather than given an empty
-- document. And the split is on *any* newline, not only blank lines: the bio
-- textarea was three rows tall and the profile page rendered a single <p> that
-- collapsed every newline in it, so each line break an organiser typed was a
-- paragraph the old page threw away. Making each one a real paragraph is the
-- honest reading of that data.
-- ---------------------------------------------------------------------------

ALTER TABLE "speaker_translations" ADD COLUMN "bio_doc" jsonb;--> statement-breakpoint
UPDATE "speaker_translations" AS target
SET "bio_doc" = jsonb_build_object('type', 'doc', 'content', source.paragraphs)
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
	FROM "speaker_translations" t,
	     LATERAL regexp_split_to_table(t."bio", E'[[:space:]]*\n[[:space:]]*') WITH ORDINALITY AS part(value, ordinality)
	WHERE btrim(part.value) <> ''
	GROUP BY t.id
) AS source
WHERE target.id = source.id;--> statement-breakpoint
ALTER TABLE "speaker_translations" DROP COLUMN "bio";--> statement-breakpoint
ALTER TABLE "speaker_translations" RENAME COLUMN "bio_doc" TO "bio";
