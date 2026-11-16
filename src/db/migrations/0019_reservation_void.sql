ALTER TABLE "refunds" DROP CONSTRAINT "refunds_reason_check";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_void_unique" ON "refunds" USING btree ("reservation_id") WHERE "refunds"."reason" = 'void';--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_requested_unique" ON "refunds" USING btree ("reservation_id") WHERE "refunds"."status" = 'requested';--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reason_check" CHECK ("refunds"."reason" in ('customer_cancel', 'owner_fault', 'auto_cancel', 'admin_exception', 'agreed_cancel', 'void'));