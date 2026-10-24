-- M.6: the two bake-off models get their provider facts (BAKEOFF_MODELS in packages/core/src/models.ts, each with its source) and their bake-off record (docs/BAKEOFF.md, 2026-10-24).
-- Kling O3 Pro passed (7/10 = 70%, bar 70%) and is enabled; Seedance 2.5 reached 6/9 (67%): it keeps its record and stays disabled, and the settings API refuses to enable it under 70%.
-- Kling's output resolution is the B.5a canary measurement (1080x1920, scripts/bakeoff/rubric.md).
UPDATE "model_configs" SET
	"ratios" = ARRAY['9:16', '1:1']::text[],
	"durations_sec" = ARRAY[5, 6, 7, 8, 9, 10]::integer[],
	"max_images" = 4,
	"output_resolution" = '1080p',
	"usd_per_second" = 0.112,
	"sources" = "sources" || '{"ratios":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video","readAt":"2026-10-23"},"durationsSec":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video","readAt":"2026-10-23"},"maxImages":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video","readAt":"2026-10-23"},"outputResolution":{"url":"scripts/bakeoff/rubric.md","readAt":"2026-10-23"},"usdPerSecond":{"url":"https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video","readAt":"2026-10-23"},"billedAmountField":{"url":"https://fal.ai/docs/model-apis/model-endpoints/queue","readAt":"2026-10-23"}}'::jsonb,
	"pass_seed_passes" = 7,
	"pass_seed_total" = 10,
	"enabled" = true,
	"updated_at" = now()
WHERE "id" = 'kling-o3-pro';
--> statement-breakpoint
UPDATE "model_configs" SET
	"ratios" = ARRAY['9:16', '1:1']::text[],
	"durations_sec" = ARRAY[5, 6, 7, 8, 9, 10]::integer[],
	"max_images" = 4,
	"output_resolution" = '720p',
	"usd_per_second" = 0.2312,
	"sources" = "sources" || '{"ratios":{"url":"https://api.replicate.com/v1/models/bytedance/seedance-2.5","readAt":"2026-10-23"},"durationsSec":{"url":"https://api.replicate.com/v1/models/bytedance/seedance-2.5","readAt":"2026-10-23"},"maxImages":{"url":"https://replicate.com/bytedance/seedance-2.5","readAt":"2026-10-23"},"outputResolution":{"url":"https://api.replicate.com/v1/models/bytedance/seedance-2.5","readAt":"2026-10-23"},"usdPerSecond":{"url":"https://replicate.com/bytedance/seedance-2.5","readAt":"2026-10-23"},"billedAmountField":{"url":"https://replicate.com/docs/reference/http","readAt":"2026-10-23"}}'::jsonb,
	"pass_seed_passes" = 6,
	"pass_seed_total" = 9,
	"updated_at" = now()
WHERE "id" = 'seedance-2.5';
