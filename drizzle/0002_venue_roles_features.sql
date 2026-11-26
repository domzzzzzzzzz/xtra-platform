CREATE TABLE "venue_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_staff" ADD COLUMN "role_id" uuid;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "features" jsonb DEFAULT '["reservations","ordering","ticketing","marketing","guests","community"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "venue_roles" ADD CONSTRAINT "venue_roles_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_roles_name_uq" ON "venue_roles" USING btree ("venue_id","name");--> statement-breakpoint
ALTER TABLE "venue_staff" ADD CONSTRAINT "venue_staff_role_id_venue_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."venue_roles"("id") ON DELETE restrict ON UPDATE no action;