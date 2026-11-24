-- 회원 탈퇴·되살리기(#154, 11/23 nnoinn 승인). 탈퇴 기록 표, 샵 탈퇴 상태, 계정 탈퇴로 일괄 마감 사유, 탈퇴로 없어진 쿠폰 시각, 같은 사람 표시,
-- 30일 뒤 지우는 칸의 빈 값 허용. 고객·원장님 계정은 한 로그인에 "탈퇴하지 않은 계정 하나"로 바꿔 30일 뒤 새 계정을 만들 수 있게 한다.
-- 두 계정이 모두 탈퇴하고 30일이 지나면 로그인 정보(auth.users)를 지우므로 profiles의 auth.users FK를 끊는다(profiles 줄은 기록 보관용, (가)).
-- 지금 있는 줄은 모두 탈퇴하지 않았고 값이 차 있어서 채울 것이 없다
CREATE TABLE "account_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_type" text NOT NULL,
	"customer_id" uuid,
	"owner_id" uuid,
	"withdrawn_at" timestamp with time zone NOT NULL,
	"restored_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"shop_status_before" text,
	"forfeited_coupon_count" integer DEFAULT 0 NOT NULL,
	"closed_slot_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "account_withdrawals_account_type_check" CHECK ("account_withdrawals"."account_type" in ('customer', 'owner')),
	CONSTRAINT "account_withdrawals_account_check" CHECK (("account_withdrawals"."account_type" = 'customer' and "account_withdrawals"."customer_id" is not null and "account_withdrawals"."owner_id" is null and "account_withdrawals"."shop_status_before" is null) or ("account_withdrawals"."account_type" = 'owner' and "account_withdrawals"."owner_id" is not null and "account_withdrawals"."customer_id" is null and "account_withdrawals"."shop_status_before" is not null)),
	CONSTRAINT "account_withdrawals_shop_status_before_check" CHECK ("account_withdrawals"."shop_status_before" is null or "account_withdrawals"."shop_status_before" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "account_withdrawals_end_check" CHECK ("account_withdrawals"."restored_at" is null or "account_withdrawals"."erased_at" is null),
	CONSTRAINT "account_withdrawals_count_check" CHECK ("account_withdrawals"."forfeited_coupon_count" >= 0 and "account_withdrawals"."closed_slot_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account_withdrawals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_user_id_unique";--> statement-breakpoint
ALTER TABLE "owners" DROP CONSTRAINT "owners_user_id_unique";--> statement-breakpoint
ALTER TABLE "shops" DROP CONSTRAINT "shops_status_check";--> statement-breakpoint
ALTER TABLE "slot_windows" DROP CONSTRAINT "slot_windows_close_reason_check";--> statement-breakpoint
ALTER TABLE "slots" DROP CONSTRAINT "slots_close_reason_check";--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "owners" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_accounts" ALTER COLUMN "account_number_encrypted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_accounts" ALTER COLUMN "account_holder" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ALTER COLUMN "business_doc_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "identity_hash" text;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "forfeited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_withdrawals" ADD CONSTRAINT "account_withdrawals_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_withdrawals" ADD CONSTRAINT "account_withdrawals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_withdrawals" ADD CONSTRAINT "account_withdrawals_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_withdrawals_open_customer_unique" ON "account_withdrawals" USING btree ("customer_id") WHERE "account_withdrawals"."restored_at" is null and "account_withdrawals"."erased_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "account_withdrawals_open_owner_unique" ON "account_withdrawals" USING btree ("owner_id") WHERE "account_withdrawals"."restored_at" is null and "account_withdrawals"."erased_at" is null;--> statement-breakpoint
CREATE INDEX "account_withdrawals_open_idx" ON "account_withdrawals" USING btree ("withdrawn_at") WHERE "account_withdrawals"."restored_at" is null and "account_withdrawals"."erased_at" is null;--> statement-breakpoint
CREATE INDEX "account_withdrawals_user_id_idx" ON "account_withdrawals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_id_active_unique" ON "customers" USING btree ("user_id") WHERE "customers"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "customers_user_id_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_user_id_active_unique" ON "owners" USING btree ("user_id") WHERE "owners"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "owners_user_id_idx" ON "owners" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profiles_identity_hash_idx" ON "profiles" USING btree ("identity_hash");--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_phone_check" CHECK ("owners"."phone" is not null or "owners"."withdrawn_at" is not null);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_forfeited_check" CHECK ("coupons"."forfeited_at" is null or "coupons"."used_order_id" is null);--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_erased_check" CHECK (("payout_accounts"."account_number_encrypted" is null) = ("payout_accounts"."account_holder" is null));--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_business_doc_path_check" CHECK ("shops"."business_doc_path" is not null or "shops"."status" = 'withdrawn');--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_status_check" CHECK ("shops"."status" in ('pending', 'approved', 'rejected', 'withdrawn'));--> statement-breakpoint
ALTER TABLE "slot_windows" ADD CONSTRAINT "slot_windows_close_reason_check" CHECK ("slot_windows"."close_reason" is null or "slot_windows"."close_reason" in ('other_channel', 'mistake', 'other', 'hold_released', 'admin', 'account_withdrawal'));--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_close_reason_check" CHECK ("slots"."close_reason" is null or "slots"."close_reason" in ('other_channel', 'mistake', 'other', 'hold_released', 'admin', 'account_withdrawal'));