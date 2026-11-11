CREATE TABLE "slot_window_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"window_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"menu_name" text NOT NULL,
	"menu_description" text,
	"list_price" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"discount_rate" integer NOT NULL,
	"sale_price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_window_menus_window_id_menu_id_unique" UNIQUE("window_id","menu_id"),
	CONSTRAINT "slot_window_menus_service_type_check" CHECK ("slot_window_menus"."service_type" in ('cut', 'perm', 'color', 'clinic', 'hair_other', 'gel_nail', 'nail_care', 'pedicure', 'lash_extension', 'lash_perm', 'nail_lash_other')),
	CONSTRAINT "slot_window_menus_discount_rate_check" CHECK ("slot_window_menus"."discount_rate" between 10 and 50),
	CONSTRAINT "slot_window_menus_duration_check" CHECK ("slot_window_menus"."duration_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "slot_window_menus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "slot_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"publish_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"new_customer_only" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_windows_status_check" CHECK ("slot_windows"."status" in ('scheduled', 'published', 'closed')),
	CONSTRAINT "slot_windows_time_order_check" CHECK ("slot_windows"."end_at" > "slot_windows"."start_at"),
	CONSTRAINT "slot_windows_close_reason_check" CHECK ("slot_windows"."close_reason" is null or "slot_windows"."close_reason" in ('other_channel', 'mistake', 'other'))
);
--> statement-breakpoint
ALTER TABLE "slot_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "window_id" uuid;--> statement-breakpoint
ALTER TABLE "slot_window_menus" ADD CONSTRAINT "slot_window_menus_window_id_slot_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."slot_windows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_window_menus" ADD CONSTRAINT "slot_window_menus_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_windows" ADD CONSTRAINT "slot_windows_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_windows" ADD CONSTRAINT "slot_windows_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slot_windows_shop_id_start_at_idx" ON "slot_windows" USING btree ("shop_id","start_at");--> statement-breakpoint
CREATE INDEX "slot_windows_status_start_at_idx" ON "slot_windows" USING btree ("status","start_at");--> statement-breakpoint
CREATE INDEX "slot_windows_publish_at_idx" ON "slot_windows" USING btree ("publish_at");--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_window_id_slot_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."slot_windows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slots_window_id_idx" ON "slots" USING btree ("window_id");--> statement-breakpoint
-- 아래는 직접 쓴 부분(#308, S-209를 넓힘). Drizzle로 표현할 수 없는 EXCLUDE 제약과 트리거다.
-- 1) 같은 샵에서 예약대기·게시중 시간대끼리 시간이 겹치지 않게 막는다(slots_no_overlap과 같은 방식, 마감한 시간대는 빠진다)
ALTER TABLE "slot_windows" ADD CONSTRAINT "slot_windows_no_overlap"
  EXCLUDE USING gist ("shop_id" WITH =, tstzrange("start_at", "end_at") WITH &&)
  WHERE ("status" IN ('scheduled', 'published'));--> statement-breakpoint
-- 2) 한 시술 매물(window_id 없음)을 예약대기·게시중·예약됨으로 저장할 때, 같은 샵의 예약대기·게시중 시간대와 겹치면 막는다.
--    표가 달라 EXCLUDE로는 막을 수 없어서 트리거로 막고, 오류는 slots_no_overlap과 같은 이름으로 낸다(원장님 화면의 "같은 시간에 이미 올린 매물" 안내를 그대로 쓴다).
--    시간대 안에서 만든 매물(window_id 있음)은 그 시간대 안이라 보지 않는다. 시간대 안 매물끼리의 겹침은 slots_no_overlap이 막는다.
--    같은 샵 줄을 먼저 잠가서, 시간대와 매물이 동시에 저장돼도 서로를 보고 겹침을 놓치지 않는다
CREATE FUNCTION "slots_block_window_overlap"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM 1 FROM "shops" WHERE "id" = NEW."shop_id" FOR NO KEY UPDATE;
  IF EXISTS (
    SELECT 1 FROM "slot_windows" w
    WHERE w."shop_id" = NEW."shop_id"
      AND w."status" IN ('scheduled', 'published')
      AND tstzrange(w."start_at", w."end_at") && tstzrange(NEW."start_at", NEW."end_at")
  ) THEN
    RAISE EXCEPTION '같은 시간에 올린 시간대 매물이 있어요'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'slots_no_overlap';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "slots_no_window_overlap"
  BEFORE INSERT OR UPDATE OF "shop_id", "start_at", "end_at", "status", "window_id" ON "slots"
  FOR EACH ROW
  WHEN (NEW."window_id" IS NULL AND NEW."status" IN ('scheduled', 'published', 'reserved'))
  EXECUTE FUNCTION "slots_block_window_overlap"();--> statement-breakpoint
-- 3) 시간대를 예약대기·게시중으로 저장할 때, 같은 샵의 예약대기·게시중·예약됨 매물과 겹치면 막는다(그 시간대 안에서 만든 매물은 뺀다).
--    오류는 slot_windows_no_overlap과 같은 이름으로 낸다(시간대 겹침은 한 이름으로 처리한다)
CREATE FUNCTION "slot_windows_block_slot_overlap"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM 1 FROM "shops" WHERE "id" = NEW."shop_id" FOR NO KEY UPDATE;
  IF EXISTS (
    SELECT 1 FROM "slots" s
    WHERE s."shop_id" = NEW."shop_id"
      AND s."status" IN ('scheduled', 'published', 'reserved')
      AND (s."window_id" IS NULL OR s."window_id" <> NEW."id")
      AND tstzrange(s."start_at", s."end_at") && tstzrange(NEW."start_at", NEW."end_at")
  ) THEN
    RAISE EXCEPTION '같은 시간에 올린 매물이 있어요'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'slot_windows_no_overlap';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "slot_windows_no_slot_overlap"
  BEFORE INSERT OR UPDATE OF "shop_id", "start_at", "end_at", "status" ON "slot_windows"
  FOR EACH ROW
  WHEN (NEW."status" IN ('scheduled', 'published'))
  EXECUTE FUNCTION "slot_windows_block_slot_overlap"();
