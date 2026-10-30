-- Google Veo 3.1 on Replicate (owner decision, 2026-10-30): spend the remaining Replicate credit first. The price is the same as fal's and Vertex's,
-- $0.20 per second without audio and $0.40 with it (https://replicate.com/google/veo-3.1, read 2026-10-30). The row copies its fal twin, keeping only the
-- ratios and durations the Replicate schema's enums allow (aspect_ratio 16:9 or 9:16, duration 4, 6 or 8 s; https://api.replicate.com/v1/models/google/veo-3.1,
-- read 2026-10-30); the schema's `image` is the one start frame. It starts disabled; the owner enables it after deploy.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources")
SELECT 'veo-3.1-replicate', 'replicate', 'google/veo-3.1', 'Google VEO 3.1 (Replicate)', "kind", "features",
	ARRAY(SELECT r FROM unnest("ratios") r WHERE r IN ('16:9', '9:16')), ARRAY(SELECT d FROM unnest("durations_sec") d WHERE d IN (4, 6, 8)), LEAST("max_images", 1), "max_prompt_chars", "output_resolution", 0.2,
	"sources" || '{"usdPerSecond":{"url":"https://replicate.com/google/veo-3.1","readAt":"2026-10-30"},"ratios":{"url":"https://api.replicate.com/v1/models/google/veo-3.1","readAt":"2026-10-30"},"durationsSec":{"url":"https://api.replicate.com/v1/models/google/veo-3.1","readAt":"2026-10-30"},"maxImages":{"url":"https://api.replicate.com/v1/models/google/veo-3.1","readAt":"2026-10-30"},"outputResolution":{"url":"https://api.replicate.com/v1/models/google/veo-3.1","readAt":"2026-10-30"},"billedAmountField":{"url":"https://replicate.com/docs/reference/http","readAt":"2026-10-30"}}'::jsonb
FROM "model_configs" WHERE "id" = 'veo-3.1'
ON CONFLICT ("id") DO NOTHING;
