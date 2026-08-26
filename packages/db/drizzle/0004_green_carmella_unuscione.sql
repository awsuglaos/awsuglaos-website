CREATE TABLE "event_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"url" text NOT NULL,
	"caption" varchar(200),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"kind" text DEFAULT 'document' NOT NULL,
	"url" text NOT NULL,
	"size_bytes" integer,
	"content_type" varchar(120),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_resources_kind_valid" CHECK ("kind" in ('slides', 'code', 'video', 'document', 'other')),
	CONSTRAINT "event_resources_size_non_negative" CHECK ("event_resources"."size_bytes" IS NULL OR "event_resources"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_resources" ADD CONSTRAINT "event_resources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_photos_event_sort_idx" ON "event_photos" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "event_resources_event_sort_idx" ON "event_resources" USING btree ("event_id","sort_order");