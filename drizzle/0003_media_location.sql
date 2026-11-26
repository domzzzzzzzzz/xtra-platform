CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "map_lat" double precision;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "map_lng" double precision;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;