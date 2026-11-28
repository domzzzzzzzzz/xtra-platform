CREATE TABLE "guest_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"promoter_id" uuid,
	"night" date NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"plus" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promoters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"code" text NOT NULL,
	"token" text NOT NULL,
	"commission_kind" text DEFAULT 'guest' NOT NULL,
	"commission" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "promoter_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "promoter_id" uuid;--> statement-breakpoint
ALTER TABLE "guest_list" ADD CONSTRAINT "guest_list_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_list" ADD CONSTRAINT "guest_list_promoter_id_promoters_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promoters" ADD CONSTRAINT "promoters_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_list_night_idx" ON "guest_list" USING btree ("venue_id","night");--> statement-breakpoint
CREATE UNIQUE INDEX "promoters_code_uq" ON "promoters" USING btree ("venue_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "promoters_token_uq" ON "promoters" USING btree ("token");