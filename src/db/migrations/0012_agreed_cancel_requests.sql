CREATE TABLE "agreed_cancel_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"reason_text" text,
	"status" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "agreed_cancel_requests_reason_check" CHECK ("agreed_cancel_requests"."reason" in ('style_mismatch', 'customer_declined', 'other')),
	CONSTRAINT "agreed_cancel_requests_status_check" CHECK ("agreed_cancel_requests"."status" in ('requested', 'agreed', 'declined', 'expired', 'closed')),
	CONSTRAINT "agreed_cancel_requests_expires_check" CHECK ("agreed_cancel_requests"."expires_at" > "agreed_cancel_requests"."requested_at")
);
--> statement-breakpoint
ALTER TABLE "agreed_cancel_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_cancel_actor_check";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_reason_check";--> statement-breakpoint
ALTER TABLE "settlement_items" DROP CONSTRAINT "settlement_items_kind_check";--> statement-breakpoint
ALTER TABLE "slot_windows" DROP CONSTRAINT "slot_windows_close_reason_check";--> statement-breakpoint
ALTER TABLE "slots" DROP CONSTRAINT "slots_close_reason_check";--> statement-breakpoint
DROP INDEX "refunds_customer_cancel_unique";--> statement-breakpoint
ALTER TABLE "agreed_cancel_requests" ADD CONSTRAINT "agreed_cancel_requests_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreed_cancel_requests" ADD CONSTRAINT "agreed_cancel_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreed_cancel_requests_pending_unique" ON "agreed_cancel_requests" USING btree ("reservation_id") WHERE "agreed_cancel_requests"."status" = 'requested';--> statement-breakpoint
CREATE INDEX "agreed_cancel_requests_reservation_id_requested_at_idx" ON "agreed_cancel_requests" USING btree ("reservation_id","requested_at");--> statement-breakpoint
CREATE INDEX "agreed_cancel_requests_pending_expires_at_idx" ON "agreed_cancel_requests" USING btree ("expires_at") WHERE "agreed_cancel_requests"."status" = 'requested';--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_cancel_unique" ON "refunds" USING btree ("reservation_id") WHERE "refunds"."reason" in ('customer_cancel', 'agreed_cancel');--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancel_actor_check" CHECK ("reservations"."cancel_actor" is null or "reservations"."cancel_actor" in ('customer', 'owner_fault', 'system', 'admin', 'agreed'));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reason_check" CHECK ("refunds"."reason" in ('customer_cancel', 'owner_fault', 'auto_cancel', 'admin_exception', 'agreed_cancel'));--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_kind_check" CHECK ("settlement_items"."kind" in ('sale', 'penalty', 'no_show', 'agreed_cancel'));--> statement-breakpoint
ALTER TABLE "slot_windows" ADD CONSTRAINT "slot_windows_close_reason_check" CHECK ("slot_windows"."close_reason" is null or "slot_windows"."close_reason" in ('other_channel', 'mistake', 'other', 'hold_released'));--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_close_reason_check" CHECK ("slots"."close_reason" is null or "slots"."close_reason" in ('other_channel', 'mistake', 'other', 'hold_released'));