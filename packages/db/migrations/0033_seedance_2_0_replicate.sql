-- Seedance 2.0 on Replicate (plan A6): $0.18 per second at 720p without a video input (https://replicate.com/bytedance/seedance-2.0, pricing
-- read 2026-10-29), 41% under fal's reference-to-video at $0.37. The Replicate adapter sends the images as reference_images (up to 9 on Replicate,
-- https://api.replicate.com/v1/models/bytedance/seedance-2.0), so the row copies features, ratios, durations and image limit from its fal reference
-- twin, the same BytePlus model, but not Marketing Studio: that needs an audio price and the adapter sends no audio. It starts disabled until its
-- canary and a 3-5 clip comparison with fal pass.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources")
SELECT 'seedance-2.0-replicate', 'replicate', 'bytedance/seedance-2.0', 'Seedance 2.0 (Replicate)', "kind", array_remove("features", 'marketing'), "ratios", "durations_sec", "max_images", "max_prompt_chars", '720p', 0.18,
	"sources" || '{"usdPerSecond":{"url":"https://replicate.com/bytedance/seedance-2.0","readAt":"2026-10-29"},"outputResolution":{"url":"https://api.replicate.com/v1/models/bytedance/seedance-2.0","readAt":"2026-10-29"},"billedAmountField":{"url":"https://replicate.com/docs/reference/http","readAt":"2026-10-29"}}'::jsonb
FROM "model_configs" WHERE "id" = 'seedance-2.0-reference'
ON CONFLICT ("id") DO NOTHING;
