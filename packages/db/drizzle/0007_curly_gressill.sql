ALTER TABLE "events" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "locale" text DEFAULT 'lo' NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registrations_event_status_created_idx" ON "registrations" USING btree ("event_id","status","created_at");--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_locale_valid" CHECK ("locale" in ('lo', 'en'));--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_status_valid" CHECK ("status" in ('pending', 'approved', 'rejected'));