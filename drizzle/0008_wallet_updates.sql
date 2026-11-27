CREATE TABLE "wallet_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"push_token" text NOT NULL,
	"pass_type_id" text NOT NULL,
	"serial" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_pass_updates" (
	"serial" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_devices_uq" ON "wallet_devices" USING btree ("device_id","pass_type_id","serial");--> statement-breakpoint
CREATE INDEX "wallet_devices_serial_idx" ON "wallet_devices" USING btree ("serial");