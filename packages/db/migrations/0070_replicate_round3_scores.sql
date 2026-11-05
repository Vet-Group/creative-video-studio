-- Third Replicate round (the last ~$0.50 of credit, 2026-11-05; docs/BAKEOFF.md, "Replicate round"): the image restyle of images 1, 7, 8, 9 and 10 on
-- the Replicate twins, judged blind by two agents who agreed on every image. Added to the totals of 0061 and written to every row of the same model as there:
-- Seedream 5 Pro 9/20 + 2/5 = 11/25; Nano Banana 2 10/20 + 3/5 = 13/25.
UPDATE "model_configs" SET "pass_seed_passes" = 11, "pass_seed_total" = 25, "updated_at" = now() WHERE "id" IN ('seedream-5-pro', 'seedream-5-pro-byteplus');
--> statement-breakpoint
UPDATE "model_configs" SET "pass_seed_passes" = 13, "pass_seed_total" = 25, "updated_at" = now() WHERE "id" IN ('nano-banana-2', 'nano-banana-2-vertex');
