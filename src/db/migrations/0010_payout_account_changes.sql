CREATE TABLE "payout_account_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"changed_by" uuid NOT NULL,
	"previous_bank_code" text,
	"previous_account_last4" text,
	"bank_code" text NOT NULL,
	"account_last4" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payout_account_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_account_changes" ADD CONSTRAINT "payout_account_changes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_account_changes" ADD CONSTRAINT "payout_account_changes_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payout_account_changes_shop_id_created_at_idx" ON "payout_account_changes" USING btree ("shop_id","created_at");