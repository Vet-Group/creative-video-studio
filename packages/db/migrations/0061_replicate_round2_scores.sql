-- Second Replicate round (the last of the credit, 2026-11-04; docs/BAKEOFF.md, "Replicate round"): blind passes added to the totals of 0057, written to
-- every row of the same model as there. Veo 3.1 1/4 + 1/3 (4 s clips) = 2/7; Seedream 5 Pro 8/18 + 1/2 = 9/20; Nano Banana 2 10/18 + 0/2 = 10/20.
-- Nano Banana 2.1 (0/2 here) keeps its Try On 9/10 for the reason given in 0057.
UPDATE "model_configs" SET "pass_seed_passes" = 2, "pass_seed_total" = 7, "updated_at" = now() WHERE "id" IN ('veo-3.1', 'veo-3.1-replicate', 'veo-3.1-vertex');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 9, "pass_seed_total" = 20, "updated_at" = now() WHERE "id" IN ('seedream-5-pro', 'seedream-5-pro-byteplus');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 10, "pass_seed_total" = 20, "updated_at" = now() WHERE "id" IN ('nano-banana-2', 'nano-banana-2-vertex');
