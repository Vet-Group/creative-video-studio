-- Google Veo 3.1 on Vertex AI (owner decision, 2026-11-01), served by the bounded transport in core/providers/vertex-video.ts. The price is an
-- ESTIMATE: https://cloud.google.com/vertex-ai/generative-ai/pricing (read 2026-11-01) lists $0.20 per 1 count without audio and $0.40 with it at 720p,
-- and the owner accepted one count as one second of output, the unit Gemini API and Replicate state for the same model. The Cloud Billing Catalog API
-- has not confirmed the unit yet, so compare the first canary jobs with Billing Reports before trusting the ledger. The row copies its fal twin within
-- what the adapter sends (720p, aspect ratio 16:9 or 9:16, duration 4, 6 or 8 s, one start frame). It starts disabled; the owner enables it after deploy.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources")
SELECT 'veo-3.1-vertex', 'vertex', 'veo-3.1-generate-001', 'Google VEO 3.1 (Vertex)', "kind", "features",
	ARRAY(SELECT r FROM unnest("ratios") r WHERE r IN ('16:9', '9:16')), ARRAY(SELECT d FROM unnest("durations_sec") d WHERE d IN (4, 6, 8)), LEAST("max_images", 1), "max_prompt_chars", '720p', 0.2,
	"sources" || '{"usdPerSecond":{"url":"https://cloud.google.com/vertex-ai/generative-ai/pricing","readAt":"2026-11-01","note":"estimate: $0.20 per 1 count, one count assumed to be one second; unit not confirmed by the Cloud Billing Catalog API"},"endpoint":{"url":"https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos","readAt":"2026-11-01"}}'::jsonb
FROM "model_configs" WHERE "id" = 'veo-3.1'
ON CONFLICT ("id") DO NOTHING;
