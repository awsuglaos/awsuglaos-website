ALTER TABLE "speakers" ADD COLUMN "community_role" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "speakers" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "speakers_role_sort_idx" ON "speakers" USING btree ("community_role","sort_order");--> statement-breakpoint
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_community_role_valid" CHECK ("community_role" in ('none', 'leader', 'co_leader', 'organiser'));