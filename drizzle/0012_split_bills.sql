ALTER TYPE "public"."pay_method" ADD VALUE 'mixed';--> statement-breakpoint
CREATE TABLE "shift_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"night" date NOT NULL,
	"expected" jsonb NOT NULL,
	"bills" integer DEFAULT 0 NOT NULL,
	"counted_cash" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"tab_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" "pay_method" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"taken_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift_closes" ADD CONSTRAINT "shift_closes_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_payments" ADD CONSTRAINT "tab_payments_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_payments" ADD CONSTRAINT "tab_payments_tab_id_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_closes_venue_idx" ON "shift_closes" USING btree ("venue_id","night");--> statement-breakpoint
CREATE INDEX "tab_payments_tab_idx" ON "tab_payments" USING btree ("tab_id");--> statement-breakpoint
CREATE INDEX "tab_payments_venue_idx" ON "tab_payments" USING btree ("venue_id","created_at");--> statement-breakpoint
INSERT INTO "tab_payments" ("venue_id", "tab_id", "amount", "method", "created_at") SELECT "venue_id", "id", "total", "pay_method", "paid_at" FROM "tabs" WHERE "status" = 'paid' AND "pay_method" IS NOT NULL AND "total" > 0;
