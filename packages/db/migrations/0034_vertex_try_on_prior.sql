-- Nano Banana 2.1 on Vertex is the same Google model as the fal row and matched it in the blind Try On rounds (docs/BAKEOFF.md, "Try On"), so it
-- carries the same 9/10 prior; on the tie the picker recommends the cheaper Vertex row ($0.034 to fal's $0.04), and the fal row stays as the fallback.
UPDATE "model_configs" SET "pass_seed_passes" = 9, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#try-on","readAt":"2026-10-29"}}'::jsonb, "updated_at" = now() WHERE "id" = 'nano-banana-2.1-vertex';
