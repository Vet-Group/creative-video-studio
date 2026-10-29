-- Nano Banana 2.1 passed 9 of 10 person + garment pairs in two blind Try On bake-offs (docs/BAKEOFF.md, "Try On"), so it outranks FASHN v1.6's
-- borrowed 8 (0014) and the Try On picker recommends it. 0014's 6 came from a general editing board, not from Try On.
UPDATE "model_configs" SET "pass_seed_passes" = 9, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#try-on","readAt":"2026-10-29"}}'::jsonb, "updated_at" = now() WHERE "id" = 'nano-banana-2.1';
