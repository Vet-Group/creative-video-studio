ALTER TABLE "jobs" DROP CONSTRAINT "jobs_feature_check";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_feature_check" CHECK ("jobs"."feature" in ('video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover', 'motion_control', 'media_optimizer', 'jewelry_try_on', 'lingerie_try_on'));--> statement-breakpoint
-- Lingerie Try-On (new on the reference site 2026-11-02) runs on Nano Banana Pro (fal and its Vertex twin) and Seedream 5.0 Pro, at their prices: the lingerie photos first, then the model. Its soft cap matches Jewelry Try-On.
INSERT INTO "feature_caps" ("feature", "monthly_usd") VALUES ('lingerie_try_on', 10) ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "model_configs" SET "features" = array_append("features", 'lingerie_try_on') WHERE "id" IN ('seedream-5-pro', 'nano-banana-pro', 'nano-banana-pro-vertex') AND NOT ('lingerie_try_on' = ANY("features"));
