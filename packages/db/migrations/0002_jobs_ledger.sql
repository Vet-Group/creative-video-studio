CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cost_centre_code" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"prompt" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_bakeoff_safe" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"label" text NOT NULL,
	"ratios" text[] NOT NULL,
	"durations_sec" integer[] NOT NULL,
	"max_images" integer,
	"output_resolution" text,
	"usd_per_second" numeric(10, 4),
	"billed_amount_field" text,
	"sources" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"pass_seed_passes" integer,
	"pass_seed_total" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_configs_provider_check" CHECK ("model_configs"."provider" in ('fal', 'replicate', 'mock')),
	CONSTRAINT "model_configs_enabled_complete_check" CHECK (not "model_configs"."enabled" or ("model_configs"."usd_per_second" is not null and "model_configs"."max_images" is not null and "model_configs"."output_resolution" is not null and cardinality("model_configs"."ratios") > 0 and cardinality("model_configs"."durations_sec") > 0))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"monthly_cap_usd" numeric(12, 4) DEFAULT '200' NOT NULL,
	"member_daily_clip_cap" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton_check" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"store_id" text,
	"retry_of" text,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"preset_id" text,
	"prompt" text NOT NULL,
	"aspect" text NOT NULL,
	"duration_s" integer NOT NULL,
	"input_asset_ids" text[] NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_job_id" text,
	"claimed_by" text,
	"error" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"output_asset_id" text,
	"poster_asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('queued', 'submitting', 'running', 'succeeded', 'failed', 'failed_unknown', 'timed_out')),
	CONSTRAINT "jobs_aspect_check" CHECK ("jobs"."aspect" in ('9:16', '1:1')),
	CONSTRAINT "jobs_provider_check" CHECK ("jobs"."provider" in ('fal', 'replicate', 'mock'))
);
--> statement-breakpoint
CREATE TABLE "cost_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"usd" numeric(12, 4) NOT NULL,
	"month" text NOT NULL,
	"day" date,
	"user_id" text,
	"team_id" text,
	"store_id" text,
	"job_id" text,
	"provider" text,
	"model" text,
	"is_final" boolean DEFAULT false NOT NULL,
	"ref" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_entries_ref_unique" UNIQUE("ref"),
	CONSTRAINT "cost_entries_kind_check" CHECK ("cost_entries"."kind" in ('estimate', 'actual_adjustment', 'release', 'late_bill', 'bakeoff', 'manual_adjustment', 'invoice_diff', 'store_reassign')),
	CONSTRAINT "cost_entries_job_shared_check" CHECK (("cost_entries"."job_id" is null) = ("cost_entries"."kind" in ('bakeoff', 'manual_adjustment', 'invoice_diff'))),
	CONSTRAINT "cost_entries_manual_note_check" CHECK ("cost_entries"."kind" <> 'manual_adjustment' or coalesce(length(trim("cost_entries"."note")), 0) > 0),
	CONSTRAINT "cost_entries_month_check" CHECK ("cost_entries"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "cost_entries_shared_unattributed_check" CHECK ("cost_entries"."job_id" is not null or ("cost_entries"."user_id" is null and "cost_entries"."team_id" is null and "cost_entries"."store_id" is null)),
	CONSTRAINT "cost_entries_day_check" CHECK ("cost_entries"."job_id" is null or "cost_entries"."day" is not null)
);
--> statement-breakpoint
CREATE TABLE "verdicts" (
	"id" text PRIMARY KEY NOT NULL,
	"output_asset_id" text NOT NULL,
	"verdict" text NOT NULL,
	"fault" text,
	"marked_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verdicts_output_asset_id_unique" UNIQUE("output_asset_id"),
	CONSTRAINT "verdicts_verdict_check" CHECK ("verdicts"."verdict" in ('pass', 'fail')),
	CONSTRAINT "verdicts_fault_check" CHECK ("verdicts"."verdict" <> 'fail' or "verdicts"."fault" is not null)
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"beat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_rates" (
	"month" text PRIMARY KEY NOT NULL,
	"vnd_per_usd" numeric(14, 4) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_rates_rate_check" CHECK ("monthly_rates"."vnd_per_usd" > 0)
);
--> statement-breakpoint
CREATE TABLE "provider_invoices" (
	"month" text NOT NULL,
	"provider" text NOT NULL,
	"total_usd" numeric(12, 4) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_invoices_month_provider_pk" PRIMARY KEY("month","provider")
);
--> statement-breakpoint
INSERT INTO "teams" ("id", "name") VALUES ('team-unassigned', U&'Ch\01b0a ph\00e2n team');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "team_id" text DEFAULT 'team-unassigned' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_retry_of_jobs_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_model_model_configs_id_fk" FOREIGN KEY ("model") REFERENCES "public"."model_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_preset_id_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."presets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_output_asset_id_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_poster_asset_id_assets_id_fk" FOREIGN KEY ("poster_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_output_asset_id_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_user_id_created_at_idx" ON "jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cost_entries_month_idx" ON "cost_entries" USING btree ("month");--> statement-breakpoint
CREATE INDEX "cost_entries_job_id_idx" ON "cost_entries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "cost_entries_team_id_month_idx" ON "cost_entries" USING btree ("team_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_entries_job_kind_once_idx" ON "cost_entries" USING btree ("job_id","kind") WHERE "cost_entries"."kind" in ('estimate', 'actual_adjustment', 'release', 'late_bill');--> statement-breakpoint
CREATE INDEX "users_team_id_idx" ON "users" USING btree ("team_id");--> statement-breakpoint
CREATE FUNCTION "cost_entries_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'cost_entries is append-only: % is not allowed', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "cost_entries_no_update_delete" BEFORE UPDATE OR DELETE ON "cost_entries" FOR EACH ROW EXECUTE FUNCTION "cost_entries_append_only"();--> statement-breakpoint
CREATE TRIGGER "cost_entries_no_truncate" BEFORE TRUNCATE ON "cost_entries" FOR EACH STATEMENT EXECUTE FUNCTION "cost_entries_append_only"();--> statement-breakpoint
CREATE VIEW "job_costs" AS SELECT "job_id", sum("usd") AS "usd", bool_or("is_final") AS "is_final" FROM "cost_entries" WHERE "job_id" IS NOT NULL GROUP BY "job_id";--> statement-breakpoint
INSERT INTO "settings" ("id") VALUES (1);--> statement-breakpoint
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "ratios", "durations_sec", "sources") VALUES
	('kling-o3-pro', 'fal', 'fal-ai/kling-video/o3/pro/reference-to-video', 'Kling O3 Pro', ARRAY[]::text[], ARRAY[]::integer[], '{}'::jsonb),
	('seedance-2.5', 'replicate', 'bytedance/seedance-2.5', 'Seedance 2.5', ARRAY[]::text[], ARRAY[]::integer[], '{}'::jsonb);--> statement-breakpoint
INSERT INTO "presets" ("id", "label", "prompt", "is_bakeoff_safe", "sort_order") VALUES
	('gentle-push-in', U&'Ti\1ebfn g\1ea7n nh\1eb9 nh\00e0ng', 'Slow, gentle push-in toward the product on a clean, plain background with soft even lighting. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.', true, 1),
	('slow-orbit', U&'Xoay quanh ch\1eadm', 'The camera moves in a slow, small arc in front of the product on a clean background, showing only the sides visible in the image. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.', false, 2),
	('lifestyle-table', U&'\0110\1eb7t tr\00ean b\00e0n \0111\1eddi th\01b0\1eddng', 'The product sits on a tidy wooden table in a bright, cozy room, with a slow subtle camera drift and natural daylight. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.', false, 3),
	('light-sweep', U&'\00c1nh s\00e1ng qu\00e9t nh\1eb9', 'A soft band of light slowly sweeps across the product, adding gentle highlights and reflections, with a nearly still camera. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.', false, 4),
	('floating-reveal', U&'S\1ea3n ph\1ea9m bay l\00ean', 'The product floats up slowly into frame and settles in the centre against a soft gradient background, with a gentle camera rise. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.', false, 5),
	('handheld-product', U&'C\1ea7m tr\00ean tay', 'A hand holds the product steady, facing the camera as in the image, in soft indoor light with subtle hand-held motion. Show only the hand. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.', false, 6);
