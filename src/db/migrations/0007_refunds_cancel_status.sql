ALTER TABLE "refunds" ALTER COLUMN "processed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_customer_cancel_unique" ON "refunds" USING btree ("reservation_id") WHERE "refunds"."reason" = 'customer_cancel';--> statement-breakpoint
CREATE INDEX "refunds_requested_created_at_idx" ON "refunds" USING btree ("created_at") WHERE "refunds"."status" = 'requested';--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK ("refunds"."status" in ('requested', 'done'));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_done_processed_check" CHECK ("refunds"."status" <> 'done' or "refunds"."processed_at" is not null);