-- Owner decision 2026-11-13: Veo 3.1 runs on Vertex first, so the cvs-vertex trial credit (about $286 left, expiring 2026-12-30) pays for it. Both cost the same
-- ($0.20 a second silent, $0.40 with sound), and fal said it retires its fal-ai/veo3.1 endpoints on 2026-11-17 (noted 2026-10-28). This swaps the pair of 0075:
-- the fal row becomes the twin that serves in place of the Vertex row while no Vertex account can (credits ended, or the day before expiry; lib/model-twins.ts
-- onePerPair), and a request the Vertex row cannot make runs on its fal twin (servingRow). Both rows keep their enabled flag.
UPDATE "model_configs" SET "twin_of" = NULL, "updated_at" = now() WHERE "id" = 'veo-3.1-vertex';--> statement-breakpoint
UPDATE "model_configs" SET "twin_of" = 'veo-3.1-vertex', "updated_at" = now() WHERE "id" = 'veo-3.1';
