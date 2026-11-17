CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" jsonb,
	"error" text,
	CONSTRAINT "cron_runs_job_check" CHECK ("cron_runs"."job" in ('payments-sweep', 'reminders', 'settlement-batch', 'slot-digest')),
	CONSTRAINT "cron_runs_finished_check" CHECK (("cron_runs"."finished_at" is null) = ("cron_runs"."ok" is null))
);
--> statement-breakpoint
ALTER TABLE "cron_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settlement_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid,
	"shop_id" uuid,
	"reason" text NOT NULL,
	"held_by" uuid NOT NULL,
	"held_at" timestamp with time zone NOT NULL,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"release_memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_holds_target_check" CHECK (("settlement_holds"."reservation_id" is null) <> ("settlement_holds"."shop_id" is null)),
	CONSTRAINT "settlement_holds_release_check" CHECK (("settlement_holds"."released_at" is null) = ("settlement_holds"."released_by" is null) and ("settlement_holds"."released_at" is null) = ("settlement_holds"."release_memo" is null))
);
--> statement-breakpoint
ALTER TABLE "settlement_holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "slot_windows" DROP CONSTRAINT "slot_windows_close_reason_check";--> statement-breakpoint
ALTER TABLE "slots" DROP CONSTRAINT "slots_close_reason_check";--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "publish_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "publish_paused_reason" text;--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_held_by_profiles_id_fk" FOREIGN KEY ("held_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_released_by_profiles_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cron_runs_job_started_at_idx" ON "cron_runs" USING btree ("job","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_holds_reservation_active_unique" ON "settlement_holds" USING btree ("reservation_id") WHERE "settlement_holds"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_holds_shop_active_unique" ON "settlement_holds" USING btree ("shop_id") WHERE "settlement_holds"."released_at" is null;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_publish_pause_check" CHECK (("shops"."publish_paused_at" is null) = ("shops"."publish_paused_reason" is null));--> statement-breakpoint
ALTER TABLE "slot_windows" ADD CONSTRAINT "slot_windows_close_reason_check" CHECK ("slot_windows"."close_reason" is null or "slot_windows"."close_reason" in ('other_channel', 'mistake', 'other', 'hold_released', 'admin'));--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_close_reason_check" CHECK ("slots"."close_reason" is null or "slots"."close_reason" in ('other_channel', 'mistake', 'other', 'hold_released', 'admin'));