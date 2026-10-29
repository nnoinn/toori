ALTER TABLE "orders" ADD COLUMN "booker_info_version" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "booker_info_agreed_at" timestamp with time zone;