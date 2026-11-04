-- Replicate round (owner-approved spend of the last Replicate credit, 2026-11-04; docs/BAKEOFF.md, "Replicate round"): blind passes of the Replicate twins,
-- written to every row that serves the same model (Replicate, BytePlus, Vertex and fal), so the picker ranks twins alike and a tie goes to the cheaper row.
-- A clip or image the provider refused (sensitive-content filter) counts as a fail, as in scripts/bakeoff/report.ts. Each total is the earlier prior plus
-- this round: Seedance 2.5 6/9 (0013) + 1/3; Seedream 5 Pro 5/10 (0014) + 3/8; Nano Banana 2 5/10 + 5/8; Nano Banana 3/10 + 1/8.
-- Nano Banana 2.1 (3/8 here) keeps its 9/10 from the blind Try On rounds (0032, 0034): the prior is not per feature, and this restyle round would push it
-- below FASHN's borrowed 8/10 in the Try On picker on evidence from another feature. Seedream 5 lite (3/8) has no CVS row.
UPDATE "model_configs" SET "pass_seed_passes" = 3, "pass_seed_total" = 10, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#replicate-round","readAt":"2026-11-04"}}'::jsonb, "updated_at" = now() WHERE "id" IN ('seedance-2.0', 'seedance-2.0-replicate', 'seedance-2.0-byteplus');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 7, "pass_seed_total" = 12, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#replicate-round","readAt":"2026-11-04"}}'::jsonb, "updated_at" = now() WHERE "id" IN ('seedance-2.5', 'seedance-2.5-byteplus');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 1, "pass_seed_total" = 4, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#replicate-round","readAt":"2026-11-04"}}'::jsonb, "updated_at" = now() WHERE "id" IN ('veo-3.1', 'veo-3.1-replicate', 'veo-3.1-vertex');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 8, "pass_seed_total" = 18, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#replicate-round","readAt":"2026-11-04"}}'::jsonb, "updated_at" = now() WHERE "id" IN ('seedream-5-pro', 'seedream-5-pro-byteplus');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 10, "pass_seed_total" = 18, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#replicate-round","readAt":"2026-11-04"}}'::jsonb, "updated_at" = now() WHERE "id" IN ('nano-banana-2', 'nano-banana-2-vertex');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 4, "pass_seed_total" = 18, "sources" = "sources" || '{"passSeed":{"url":"docs/BAKEOFF.md#replicate-round","readAt":"2026-11-04"}}'::jsonb, "updated_at" = now() WHERE "id" IN ('nano-banana', 'nano-banana-vertex');
