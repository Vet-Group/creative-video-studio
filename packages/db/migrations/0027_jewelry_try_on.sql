ALTER TABLE "jobs" DROP CONSTRAINT "jobs_feature_check";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_feature_check" CHECK ("jobs"."feature" in ('video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover', 'motion_control', 'media_optimizer', 'jewelry_try_on'));--> statement-breakpoint
-- Jewelry Try-On (new on the reference site 2026-10-28) runs on the three Nano Banana edit models that already serve Try On, at their prices: the jewelry
-- photo first, then the person. Its soft cap matches Background Changer's, the closest app in use.
INSERT INTO "feature_caps" ("feature", "monthly_usd") VALUES ('jewelry_try_on', 10) ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "model_configs" SET "features" = array_append("features", 'jewelry_try_on') WHERE "id" IN ('nano-banana', 'nano-banana-2.1', 'nano-banana-pro') AND NOT ('jewelry_try_on' = ANY("features"));
