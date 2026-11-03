ALTER TABLE "jobs" DROP CONSTRAINT "jobs_provider_check";--> statement-breakpoint
ALTER TABLE "model_configs" DROP CONSTRAINT "model_configs_provider_check";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_provider_check" CHECK ("jobs"."provider" in ('fal', 'replicate', 'vertex', 'byteplus', 'mock'));--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_provider_check" CHECK ("model_configs"."provider" in ('fal', 'replicate', 'vertex', 'byteplus', 'mock'));--> statement-breakpoint
-- BytePlus ModelArk (ByteDance's own API) as the fifth provider (owner decision, 2026-11-03): the Seedance and Seedream models at the official price,
-- meant to become the primary twin of each family with fal as the fallback. Every row starts disabled; an Admin switches one on in Settings once its
-- canary has passed. Model ids, durations, ratios and image limits: https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md
-- and .../model-list.md (read 2026-11-04). Prices: https://docs.byteplus.com/en/docs/modelark/model-pricing (online inference, input without video,
-- read 2026-11-03). Video is billed per million tokens, tokens = seconds x width x height x 24 / 1024, so usd_per_second is that price times the tokens
-- of one second at the row's resolution, rounded up to the column's 4 decimals: 720p (921,600 pixels) is 21,600 tokens per second; Seedance 1.0 renders
-- 704 px for "720p" 9:16, under the worker's 720p floor, so its rows ask for 1080p (1920x1088, 48,960 tokens per second), as the fal twin does (0016).
-- Seedance 2.5 takes 4 to 30 s, but the row offers 4 to 15 s, as the 2.0 rows do: the create page's own example took 581 s for an 11 s 720p clip and
-- the worker gives a job 10 minutes, so a 20 to 30 s clip would time out after BytePlus billed it. Widen it once a canary has measured the latency.
-- The reference images are 1 to 9 on Seedance 2.0 and 2.5 (omni reference-to-video); Seedance 1.0 takes one first-frame image.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "output_resolution", "usd_per_second", "billed_amount_field", "sources")
SELECT v.id, 'byteplus', v.endpoint, v.label, 'video', ARRAY['video']::text[], ARRAY['9:16', '1:1', '16:9', '4:3', '3:4']::text[], v.durations, v.max_images, v.resolution, v.usd, 'usage.completion_tokens',
	jsonb_build_object(
		'endpoint', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-list.md', 'readAt', '2026-11-04'),
		'ratios', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md', 'readAt', '2026-11-04'),
		'durationsSec', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md', 'readAt', '2026-11-04'),
		'maxImages', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md', 'readAt', '2026-11-04'),
		'outputResolution', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md', 'readAt', '2026-11-04'),
		'usdPerSecond', jsonb_build_object('url', 'https://docs.byteplus.com/en/docs/modelark/model-pricing', 'readAt', '2026-11-03', 'note', v.price_note),
		'billedAmountField', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/get-video-generation-task-api.md', 'readAt', '2026-11-04'))
FROM (VALUES
	('seedance-2.5-byteplus', 'dreamina-seedance-2-5-260628', 'Seedance 2.5 (BytePlus)', ARRAY[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]::integer[], 9, '720p', 0.2312, '$10.70 per 1M tokens at 480p and 720p, 21,600 tokens per second at 720p'),
	('seedance-2.0-byteplus', 'dreamina-seedance-2-0-260128', 'Seedance 2.0 (BytePlus)', ARRAY[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]::integer[], 9, '720p', 0.1512, '$7.00 per 1M tokens at 480p and 720p, 21,600 tokens per second at 720p'),
	('seedance-2.0-fast-byteplus', 'dreamina-seedance-2-0-fast-260128', 'Seedance 2.0 Fast (BytePlus)', ARRAY[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]::integer[], 9, '720p', 0.1210, '$5.60 per 1M tokens (480p and 720p only), 21,600 tokens per second at 720p'),
	('seedance-2.0-mini-byteplus', 'dreamina-seedance-2-0-mini-260615', 'Seedance 2.0 Mini (BytePlus)', ARRAY[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]::integer[], 9, '720p', 0.0756, '$3.50 per 1M tokens (480p and 720p only), 21,600 tokens per second at 720p'),
	('seedance-1.0-pro-byteplus', 'seedance-1-0-pro-250528', 'Seedance 1.0 Pro (BytePlus)', ARRAY[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::integer[], 1, '1080p', 0.1224, '$2.50 per 1M tokens online, 48,960 tokens per second at 1080p (1920x1088)'),
	('seedance-1.0-pro-fast-byteplus', 'seedance-1-0-pro-fast-251015', 'Seedance 1.0 Pro Fast (BytePlus)', ARRAY[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::integer[], 1, '1080p', 0.0490, '$1.00 per 1M tokens, 48,960 tokens per second at 1080p (1920x1088)')
) AS v (id, endpoint, label, durations, max_images, resolution, usd, price_note)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Seedream 5.0 Pro and Flash (image generation API, https://ai.byteplus.com/ark/region:ap-southeast-1/docs/image-generation-api.md, read 2026-11-04):
-- features, ratios, image limit and prompt limit come from the fal Seedream 5.0 Pro row, the same model; the API takes up to 10 reference images and
-- any ratio from 1:16 to 16:1. Pro is $0.045 per image up to 2.61 MP and $0.09 above (https://docs.byteplus.com/en/docs/modelark/model-pricing, read
-- 2026-11-03): the adapter's 1K target is about 1.1 MP and its 2K target about 4 MP. Flash is $0.018 per image. Pro bills input images after the first at
-- $0.003 each (Flash's are free): packages/core/src/models.ts EXTRA_INPUT_IMAGE_USD adds that to the estimate and to the cost the adapter books.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "image_prices", "sources")
SELECT v.id, 'byteplus', v.endpoint, v.label, 'image', m."features", m."ratios", ARRAY[]::integer[], m."max_images", m."max_prompt_chars", v.prices::jsonb,
	jsonb_build_object(
		'imagePrices', jsonb_build_object('url', 'https://docs.byteplus.com/en/docs/modelark/model-pricing', 'readAt', '2026-11-03'),
		'endpoint', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-list.md', 'readAt', '2026-11-04'),
		'size', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/image-generation-api.md', 'readAt', '2026-11-04'),
		'ratios', m."sources"->'ratios', 'maxImages', m."sources"->'maxImages', 'maxPromptChars', m."sources"->'maxPromptChars')
FROM (VALUES
	('seedream-5-pro-byteplus', 'dola-seedream-5-0-pro-260628', 'Seedream 5.0 Pro (BytePlus)', '{"1K":"0.045","2K":"0.09"}'),
	('seedream-5-flash-byteplus', 'dola-seedream-5-0-flash-260915', 'Seedream 5.0 Flash (BytePlus)', '{"1K":"0.018","2K":"0.018"}')
) AS v (id, endpoint, label, prices)
JOIN "model_configs" m ON m."id" = 'seedream-5-pro'
ON CONFLICT ("id") DO NOTHING;
