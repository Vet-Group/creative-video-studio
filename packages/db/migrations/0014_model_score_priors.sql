-- Prior quality for the image models, so the recommendation score (apps/web/src/lib/model-scores.ts) has a starting point before staff mark results.
-- pass_seed_passes / pass_seed_total is read as "passes out of 10" and staff Pass/Fail marks add to it. For the editing models it is the expected win
-- rate against a 1100-Elo model on the Artificial Analysis image editing board (AA-Image-Editing v2.1, read 2026-10-25), 1 / (1 + 10^((1100 - Elo) / 400)),
-- rounded to tenths: Nano Banana 2.1 1151 -> 6, GPT Image 2 (high) 1136 -> 6, Seedream 5.0 Pro 1131 -> 5, Nano Banana 2 1123 -> 5, Nano Banana Pro 1108 -> 5,
-- Nano Banana 984 -> 3. FASHN v1.6 is not on that board; independent try-on tests rank it first for garment fidelity (100% success in 160 pairs), so 8.
UPDATE "model_configs" SET "pass_seed_passes" = 6, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"https://artificialanalysis.ai/image/leaderboard/editing","readAt":"2026-10-25"}}'::jsonb, "updated_at" = now() WHERE "id" = 'nano-banana-2.1';
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 6, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"https://artificialanalysis.ai/image/leaderboard/editing","readAt":"2026-10-25"}}'::jsonb, "updated_at" = now() WHERE "id" = 'gpt-image-2';
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 5, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"https://artificialanalysis.ai/image/leaderboard/editing","readAt":"2026-10-25"}}'::jsonb, "updated_at" = now() WHERE "id" = 'seedream-5-pro';
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 5, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"https://artificialanalysis.ai/image/leaderboard/editing","readAt":"2026-10-25"}}'::jsonb, "updated_at" = now() WHERE "id" = 'nano-banana-2';
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 5, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"https://artificialanalysis.ai/image/leaderboard/editing","readAt":"2026-10-25"}}'::jsonb, "updated_at" = now() WHERE "id" = 'nano-banana-pro';
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 3, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"https://artificialanalysis.ai/image/leaderboard/editing","readAt":"2026-10-25"}}'::jsonb, "updated_at" = now() WHERE "id" = 'nano-banana';
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 8, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"https://www.ionio.ai/blog/vton","readAt":"2026-10-25"}}'::jsonb, "updated_at" = now() WHERE "id" = 'fashn-v1.6';
