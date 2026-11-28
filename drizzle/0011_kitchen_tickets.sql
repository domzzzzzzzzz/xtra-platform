ALTER TABLE "menu_items" ADD COLUMN "station" text DEFAULT 'bar' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tab_items" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tab_items" ADD COLUMN "station" text DEFAULT 'bar' NOT NULL;--> statement-breakpoint
ALTER TABLE "tab_items" ADD COLUMN "ticket_no" integer;--> statement-breakpoint
ALTER TABLE "tab_items" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tab_items" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tab_items_tab_idx" ON "tab_items" USING btree ("tab_id");--> statement-breakpoint
UPDATE "tab_items" SET "status" = 'served', "sent_at" = "created_at", "ready_at" = "created_at" WHERE "status" IN ('sent', 'served');
--> statement-breakpoint
INSERT INTO "venue_roles" ("venue_id", "name", "permissions") SELECT "id", 'Kitchen', '["kitchen"]'::jsonb FROM "venues" ON CONFLICT DO NOTHING;