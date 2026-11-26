ALTER TABLE "event_seats" ADD COLUMN "seats" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_seats" ADD COLUMN "shape" text;--> statement-breakpoint
ALTER TABLE "event_seats" ADD COLUMN "rotation" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_zones" ADD COLUMN "shape" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "lineup" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "seat_map" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "floor_items" ADD COLUMN "deposit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "party_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "bill_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_slots" ADD COLUMN "max_bookings" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;