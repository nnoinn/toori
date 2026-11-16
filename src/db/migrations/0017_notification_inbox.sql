ALTER TABLE "notifications" DROP CONSTRAINT "notifications_status_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notifications_inbox_idx" ON "notifications" USING btree ("user_id","account_type","created_at","id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" in ('sent', 'failed', 'no_device'));