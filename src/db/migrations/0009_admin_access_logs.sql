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
CREATE INDEX "admin_access_logs_admin_created_at_idx" ON "admin_access_logs" USING btree ("admin_id","created_at");