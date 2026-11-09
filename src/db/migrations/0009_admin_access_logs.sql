CREATE TABLE "admin_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"path" text NOT NULL,
	"query" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_access_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_access_logs" ADD CONSTRAINT "admin_access_logs_admin_id_profiles_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_access_logs_created_at_idx" ON "admin_access_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_access_logs_admin_created_at_idx" ON "admin_access_logs" USING btree ("admin_id","created_at");--> statement-breakpoint
-- 운영자 열람 기록은 고치거나 지울 수 없다(접속 기록 위·변조 방지, #286 리뷰 11/9 nnoinn). 보관 기간이 지난 기록 정리는 출시 때 정한다
CREATE FUNCTION "admin_access_logs_block_change"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '운영자 열람 기록은 고치거나 지울 수 없어요(#269)';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "admin_access_logs_no_update_delete" BEFORE UPDATE OR DELETE ON "admin_access_logs" FOR EACH ROW EXECUTE FUNCTION "admin_access_logs_block_change"();--> statement-breakpoint
CREATE TRIGGER "admin_access_logs_no_truncate" BEFORE TRUNCATE ON "admin_access_logs" FOR EACH STATEMENT EXECUTE FUNCTION "admin_access_logs_block_change"();
