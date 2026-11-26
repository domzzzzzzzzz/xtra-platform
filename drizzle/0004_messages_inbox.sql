ALTER TABLE "messages" ADD COLUMN "direction" text DEFAULT 'out' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sent_by" uuid;--> statement-breakpoint
CREATE INDEX "messages_to_idx" ON "messages" USING btree ("to","created_at");--> statement-breakpoint
CREATE INDEX "messages_provider_idx" ON "messages" USING btree ("provider_id");