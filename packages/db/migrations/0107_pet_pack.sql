ALTER TABLE "examples" DROP CONSTRAINT "examples_product_type_check";--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_feature_check";--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_product_type_check" CHECK ("examples"."product_type" in ('tshirt', 'jersey', 'hoodie', 'mask_hoodie', 'hawaiian', 'polo', 'mug', 'tumbler', 'ornament', 'flag', 'decal', 'poster', 'blanket', 'rug', 'cap', 'jewelry', 'shoes', 'garage', 'door', 'curtain', 'home', 'other'));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_feature_check" CHECK ("jobs"."feature" in ('video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover', 'motion_control', 'media_optimizer', 'jewelry_try_on', 'lingerie_try_on', 'fashion_model', 'multi_angle', 'breed_swap'));--> statement-breakpoint
-- The pet pack (owner-approved 2026-11-19): a `rug` product type for the Examples filter, and the breed swap app (feature `breed_swap`), which replaces the dog in
-- one picture with each breed the member picks, one job per breed, each with its own prompt (breedSwapPrompt in apps/web/src/lib/apps.ts). It runs on the Nano Banana
-- edit rows already here, which keep the rest of a picture (its text, names and layout) when they edit one part of it: Nano Banana 2.1 at its stored $0.04 for 1K
-- (fal bills it in tokens, https://fal.ai/models/google/nano-banana-2.1/edit) and Nano Banana Pro at $0.15 per image (pricing read 2026-11-19,
-- https://fal.ai/models/fal-ai/nano-banana-pro/edit), each with its Vertex twin (0075) as 0091 did for fashion_model. No row is enabled or repriced here.
-- Its soft cap matches the multi-angle app.
INSERT INTO "feature_caps" ("feature", "monthly_usd") VALUES ('breed_swap', 10) ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "model_configs" SET "features" = array_append("features", 'breed_swap') WHERE "id" IN ('nano-banana-2.1', 'nano-banana-2.1-vertex', 'nano-banana-pro', 'nano-banana-pro-vertex') AND NOT ('breed_swap' = ANY("features"));
