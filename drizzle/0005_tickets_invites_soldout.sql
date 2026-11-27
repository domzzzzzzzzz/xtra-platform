ALTER TABLE "event_zones" ADD COLUMN "sold_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "kind" text DEFAULT 'sale' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;