ALTER TYPE "public"."payment_purpose" ADD VALUE 'saas';--> statement-breakpoint
CREATE TABLE "saas_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"number" text NOT NULL,
	"period" text NOT NULL,
	"amount" integer NOT NULL,
	"vat" integer NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "plan" jsonb DEFAULT '{"price":0,"status":"trial"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_payouts" ADD CONSTRAINT "venue_payouts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saas_invoices_period_uq" ON "saas_invoices" USING btree ("venue_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_invoices_number_uq" ON "saas_invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "venue_payouts_venue_idx" ON "venue_payouts" USING btree ("venue_id","paid_on");