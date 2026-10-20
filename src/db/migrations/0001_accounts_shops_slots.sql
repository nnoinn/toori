-- 자동 생성(drizzle-kit) 뒤 한 곳을 직접 고쳤다: shops.location의 타입 이름 따옴표를 뺐다.
-- drizzle-kit 0.31은 자기가 모르는 타입(geography)을 따옴표로 감싸서 "geography(point, 4326)"라는 없는 타입을 찾게 만든다.
-- 이 컬럼을 나중에 바꾸는 마이그레이션이 생기면 같은 부분을 다시 확인한다(src/db/schema/types.ts geographyPoint).
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"phone" text,
	"last_interest_push_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "terms_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_type" text NOT NULL,
	"terms_type" text NOT NULL,
	"version" text NOT NULL,
	"agreed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "terms_agreements_account_type_check" CHECK ("terms_agreements"."account_type" in ('customer', 'owner')),
	CONSTRAINT "terms_agreements_terms_type_check" CHECK ("terms_agreements"."terms_type" in ('service', 'privacy', 'location', 'supplier', 'marketing'))
);
--> statement-breakpoint
ALTER TABLE "terms_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "location_use_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_use_logs_purpose_check" CHECK ("location_use_logs"."purpose" in ('nearby_search', 'map'))
);
--> statement-breakpoint
ALTER TABLE "location_use_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"list_price" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menus_service_type_check" CHECK ("menus"."service_type" in ('cut', 'perm', 'color', 'clinic', 'hair_other', 'gel_nail', 'nail_care', 'pedicure', 'lash_extension', 'lash_perm', 'nail_lash_other'))
);
--> statement-breakpoint
ALTER TABLE "menus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"bank_code" text NOT NULL,
	"account_number_encrypted" text NOT NULL,
	"account_last4" text NOT NULL,
	"account_holder" text NOT NULL,
	"pg_seller_id" text,
	"pg_seller_status" text DEFAULT 'not_registered' NOT NULL,
	"pg_seller_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_accounts_shop_id_unique" UNIQUE("shop_id"),
	CONSTRAINT "payout_accounts_pg_seller_status_check" CHECK ("payout_accounts"."pg_seller_status" in ('not_registered', 'requested', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "payout_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shop_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"menu_id" uuid,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_images_kind_check" CHECK ("shop_images"."kind" in ('main', 'style'))
);
--> statement-breakpoint
ALTER TABLE "shop_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"phone" text NOT NULL,
	"road_address" text NOT NULL,
	"jibun_address" text,
	"address_detail" text,
	"sido" text NOT NULL,
	"sigungu" text NOT NULL,
	"sigungu_code" text NOT NULL,
	"location" geography(point, 4326) NOT NULL,
	"business_hours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"instagram_url" text,
	"naver_place_url" text,
	"business_name" text NOT NULL,
	"representative_name" text NOT NULL,
	"business_registration_number" text NOT NULL,
	"opened_on" date NOT NULL,
	"business_doc_path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_owner_id_unique" UNIQUE("owner_id"),
	CONSTRAINT "shops_category_check" CHECK ("shops"."category" in ('hair', 'nail_lash')),
	CONSTRAINT "shops_status_check" CHECK ("shops"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "shops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"menu_name" text NOT NULL,
	"menu_description" text,
	"list_price" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"discount_rate" integer NOT NULL,
	"sale_price" integer NOT NULL,
	"new_customer_only" boolean DEFAULT false NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"publish_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"hold_customer_id" uuid,
	"hold_expires_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"relisted_from_slot_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_status_check" CHECK ("slots"."status" in ('scheduled', 'published', 'reserved', 'closed', 'cancelled', 'completed')),
	CONSTRAINT "slots_service_type_check" CHECK ("slots"."service_type" in ('cut', 'perm', 'color', 'clinic', 'hair_other', 'gel_nail', 'nail_care', 'pedicure', 'lash_extension', 'lash_perm', 'nail_lash_other')),
	CONSTRAINT "slots_discount_rate_check" CHECK ("slots"."discount_rate" between 10 and 50),
	CONSTRAINT "slots_time_order_check" CHECK ("slots"."end_at" > "slots"."start_at"),
	CONSTRAINT "slots_close_reason_check" CHECK ("slots"."close_reason" is null or "slots"."close_reason" in ('other_channel', 'mistake', 'other'))
);
--> statement-breakpoint
ALTER TABLE "slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_use_logs" ADD CONSTRAINT "location_use_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_images" ADD CONSTRAINT "shop_images_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_images" ADD CONSTRAINT "shop_images_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_hold_customer_id_customers_id_fk" FOREIGN KEY ("hold_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_relisted_from_slot_id_slots_id_fk" FOREIGN KEY ("relisted_from_slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_use_logs_created_at_idx" ON "location_use_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shops_location_idx" ON "shops" USING gist ("location");--> statement-breakpoint
CREATE INDEX "shops_status_idx" ON "shops" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shops_sigungu_code_idx" ON "shops" USING btree ("sigungu_code");--> statement-breakpoint
CREATE INDEX "slots_status_start_at_idx" ON "slots" USING btree ("status","start_at");--> statement-breakpoint
CREATE INDEX "slots_shop_id_start_at_idx" ON "slots" USING btree ("shop_id","start_at");--> statement-breakpoint
CREATE INDEX "slots_publish_at_idx" ON "slots" USING btree ("publish_at");