-- 관심 매물(C-211)과 첫 로그인 안내(C-107) (#616, 3단계 3-A). 관심 매물 표를 만들고 고객 계정에 안내를 본 시각을 더한다.
-- 관심 샵은 favorites 표를 그대로 쓴다. 지금 있는 고객 계정은 안내 시각이 비어 있어서 다음 로그인 때 한 번 안내를 본다
CREATE TABLE "slot_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"slot_id" uuid,
	"window_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_interests_customer_slot_unique" UNIQUE("customer_id","slot_id"),
	CONSTRAINT "slot_interests_target_check" CHECK (not ("slot_interests"."slot_id" is null and "slot_interests"."window_id" is null))
);
--> statement-breakpoint
ALTER TABLE "slot_interests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "onboarding_seen_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "slot_interests" ADD CONSTRAINT "slot_interests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_interests" ADD CONSTRAINT "slot_interests_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_interests" ADD CONSTRAINT "slot_interests_window_id_slot_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."slot_windows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slot_interests_customer_created_at_idx" ON "slot_interests" USING btree ("customer_id","created_at");