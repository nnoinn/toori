-- 이의제기 접수 경로·접수 시각·등록한 운영자·결론 종류 (#350, 11/12 승인)
-- 지금 있는 기록은 모두 고객이 앱에서 접수한 것이라 channel = 'app', received_at = created_at으로 채운 뒤 NOT NULL을 건다
ALTER TABLE "disputes" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
UPDATE "disputes" SET "channel" = 'app', "received_at" = "created_at";--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "channel" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "received_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "registered_by" uuid;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_registered_by_profiles_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_reservation_id_unique" UNIQUE("reservation_id");--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_channel_check" CHECK ("disputes"."channel" in ('app', 'kakao'));--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_registered_by_check" CHECK (("disputes"."channel" = 'kakao') = ("disputes"."registered_by" is not null));--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_outcome_check" CHECK ("disputes"."outcome" is null or "disputes"."outcome" in ('no_show_confirmed', 'no_show_reversed', 'refund_exception', 'voided', 'owner_fault_cancel', 'no_change'));--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_outcome_status_check" CHECK (("disputes"."status" = 'resolved') = ("disputes"."outcome" is not null));