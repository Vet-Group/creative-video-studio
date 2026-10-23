CREATE TABLE "feature_caps" (
	"feature" text PRIMARY KEY NOT NULL,
	"monthly_usd" numeric(12, 4) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "feature" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "features_monthly_cap_usd" numeric(12, 4) DEFAULT '260' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "member_daily_usd_cap" numeric(12, 4) DEFAULT '10' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "member_monthly_usd_cap" numeric(12, 4) DEFAULT '50' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_feature_check" CHECK ("jobs"."feature" in ('video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover', 'motion_control', 'media_optimizer'));--> statement-breakpoint
-- Soft caps from the 2026-10-24 provider proposal: each feature's simulated p95 for 30 staff, rounded up to 5 USD.
INSERT INTO "feature_caps" ("feature", "monthly_usd") VALUES ('try_on', 45), ('image', 135), ('character_swap', 10), ('model_swap', 20), ('background_changer', 10), ('reframe', 5), ('image_upscale', 15), ('face_swap', 5), ('background_remover', 10), ('motion_control', 40) ON CONFLICT DO NOTHING;
