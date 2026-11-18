-- 원장님에게 보여 줄 운영자 사유 코드(#489, 11/18 nnoinn 승인). 운영자가 쓴 사유·메모 칸은 그대로 두고 코드 칸만 더한다.
-- 0021 전에 건 정산 보류·게시 멈춤·운영자 마감은 코드를 other(기타)로 채운다. 칸을 비운 채로 만들고 채운 뒤 check와 필수를 건다
ALTER TABLE "shops" DROP CONSTRAINT "shops_publish_pause_check";--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD COLUMN "reason_code" text;--> statement-breakpoint
UPDATE "settlement_holds" SET "reason_code" = 'other';--> statement-breakpoint
ALTER TABLE "settlement_holds" ALTER COLUMN "reason_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "publish_paused_code" text;--> statement-breakpoint
UPDATE "shops" SET "publish_paused_code" = 'other' WHERE "publish_paused_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "slot_windows" ADD COLUMN "admin_close_code" text;--> statement-breakpoint
UPDATE "slot_windows" SET "admin_close_code" = 'other' WHERE "close_reason" = 'admin';--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "admin_close_code" text;--> statement-breakpoint
UPDATE "slots" SET "admin_close_code" = 'other' WHERE "close_reason" = 'admin';--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_reason_code_check" CHECK ("settlement_holds"."reason_code" in ('user_inquiry', 'payment_check', 'payout_info_check', 'owner_request', 'other'));--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_publish_paused_code_check" CHECK ("shops"."publish_paused_code" is null or "shops"."publish_paused_code" in ('user_inquiry', 'shop_info_check', 'owner_request', 'other'));--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_publish_pause_check" CHECK (("shops"."publish_paused_at" is null) = ("shops"."publish_paused_reason" is null) and ("shops"."publish_paused_at" is null) = ("shops"."publish_paused_code" is null));--> statement-breakpoint
ALTER TABLE "slot_windows" ADD CONSTRAINT "slot_windows_admin_close_code_check" CHECK (("slot_windows"."close_reason" is not distinct from 'admin') = ("slot_windows"."admin_close_code" is not null) and ("slot_windows"."admin_close_code" is null or "slot_windows"."admin_close_code" in ('listing_mismatch', 'user_inquiry', 'owner_request', 'other')));--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_admin_close_code_check" CHECK (("slots"."close_reason" is not distinct from 'admin') = ("slots"."admin_close_code" is not null) and ("slots"."admin_close_code" is null or "slots"."admin_close_code" in ('listing_mismatch', 'user_inquiry', 'owner_request', 'other')));
