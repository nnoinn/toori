-- 운영자 프로필과 운영자 작업 기록 지키기 (#372 4·5장, 11/13 nnoinn)
-- admin_profiles: 운영자 화면과 기록 화면에 보일 이름. 그만둔 운영자도 기록에 이름이 보여야 해서 지우지 않는다(이름 고치기는 된다)
-- admin_actions: 운영자 작업 기록도 열람 기록(0009)처럼 앱에서 고치거나 지울 수 없다(AUTH-10)
CREATE TABLE "admin_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION "admin_actions_block_change"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '운영자 작업 기록은 고치거나 지울 수 없어요(#372)';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "admin_actions_no_update_delete" BEFORE UPDATE OR DELETE ON "admin_actions" FOR EACH ROW EXECUTE FUNCTION "admin_actions_block_change"();--> statement-breakpoint
CREATE TRIGGER "admin_actions_no_truncate" BEFORE TRUNCATE ON "admin_actions" FOR EACH STATEMENT EXECUTE FUNCTION "admin_actions_block_change"();--> statement-breakpoint
CREATE FUNCTION "admin_profiles_block_delete"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '운영자 프로필은 지울 수 없어요(그만둔 운영자도 기록에 이름이 보여야 해요, #372)';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "admin_profiles_no_delete" BEFORE DELETE ON "admin_profiles" FOR EACH ROW EXECUTE FUNCTION "admin_profiles_block_delete"();--> statement-breakpoint
CREATE TRIGGER "admin_profiles_no_truncate" BEFORE TRUNCATE ON "admin_profiles" FOR EACH STATEMENT EXECUTE FUNCTION "admin_profiles_block_delete"();
