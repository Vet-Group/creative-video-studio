-- Four cheaper fal models, each a row of its own and each disabled: an Admin enables it after a canary (docs/ops/adding-a-model.md). None is a twin of another row
-- (twin_of stays null): they are other models, not a second provider of one. Schemas read from https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint> and prices
-- from https://fal.ai/models/<endpoint>, both on 2026-11-26.
-- Veo 3.1 Lite: $0.03 a second silent and $0.05 with sound at 720p (1080p $0.05 / $0.08); the sound price is AUDIO_USD_PER_SECOND in core/models.ts. 4, 6 or 8 s, the ratios 16:9 and 9:16
-- (the schema adds auto, which the app offers no Veo), no end frame. Veo 3.1 Fast: $0.10 and $0.15 at 720p and 1080p. Both ask for 720p (fal.ts).
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources")
SELECT v.id, 'fal', v.endpoint, v.label, 'video', ARRAY['video']::text[], ARRAY['9:16', '16:9']::text[], ARRAY[4, 6, 8]::integer[], 1, 20000, '720p', v.usd,
	jsonb_build_object(
		'ratios', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || v.endpoint, 'readAt', '2026-11-26'),
		'durationsSec', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || v.endpoint, 'readAt', '2026-11-26'),
		'maxImages', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || v.endpoint, 'readAt', '2026-11-26'),
		'maxPromptChars', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || v.endpoint, 'readAt', '2026-11-26'),
		'outputResolution', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || v.endpoint, 'readAt', '2026-11-26'),
		'usdPerSecond', jsonb_build_object('url', 'https://fal.ai/models/' || v.endpoint, 'readAt', '2026-11-26'))
FROM (VALUES
	('veo-3.1-lite', 'fal-ai/veo3.1/lite/image-to-video', 'Veo 3.1 Lite', 0.03),
	('veo-3.1-fast', 'fal-ai/veo3.1/fast/image-to-video', 'Veo 3.1 Fast', 0.10)
) AS v(id, endpoint, label, usd)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Minimax H3 Max Turbo at 480p, 768p and 1080p, as H3 Max has them (0036), at fal's standard rates from 2026-11-16 ($0.025, $0.04 and $0.08 a second; the page's earlier
-- promotions are not stored). The schema is H3 Max's image-to-video schema: no ratio field (the first image is cropped to the ratio), a first and a last frame, no audio switch,
-- prompt up to 50,000 characters; the rows offer the same 5 to 15 s as H3 Max.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources")
SELECT v.id, 'fal', 'minimax/h3-max-turbo/image-to-video', v.label, 'video', ARRAY['video']::text[], ARRAY['9:16', '1:1']::text[], ARRAY[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]::integer[], 1, 50000, v.res, v.usd,
	jsonb_build_object(
		'ratios', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max-turbo/image-to-video', 'readAt', '2026-11-26'),
		'durationsSec', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max-turbo/image-to-video', 'readAt', '2026-11-26'),
		'maxImages', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max-turbo/image-to-video', 'readAt', '2026-11-26'),
		'maxPromptChars', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max-turbo/image-to-video', 'readAt', '2026-11-26'),
		'outputResolution', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max-turbo/image-to-video', 'readAt', '2026-11-26'),
		'usdPerSecond', jsonb_build_object('url', 'https://fal.ai/models/minimax/h3-max-turbo/image-to-video', 'readAt', '2026-11-26'))
FROM (VALUES
	('minimax-h3-max-turbo', 'MiniMax H3 Max Turbo', '768p', 0.04),
	('minimax-h3-max-turbo-480p', 'MiniMax H3 Max Turbo 480p', '480p', 0.025),
	('minimax-h3-max-turbo-1080p', 'MiniMax H3 Max Turbo 1080p', '1080p', 0.08)
) AS v(id, label, res, usd)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Seedream 5.5 Edit: $0.03 an output image at 1K and $0.0405 at 2K (over 2,610,000 pixels), plus $0.012 for EVERY input image, the first too (page, read 2026-11-26).
-- The row stores the price with one input image, $0.042 and $0.0525; each further image is added by EXTRA_INPUT_IMAGE_USD in core/models.ts. A job with no input image goes to the
-- text-to-image twin (FAL_TEXT_ENDPOINTS) and is reserved $0.012 over its $0.03 / $0.0405, a margin on the safe side. Up to 10 input images (schema), the ratios of Seedream 5.0 Pro.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "image_prices", "sources")
VALUES (
	'seedream-5.5', 'fal', 'bytedance/seedream/v5.5/edit', 'Seedream 5.5', 'image', ARRAY['image']::text[],
	ARRAY['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9']::text[], ARRAY[]::integer[], 10, '{"1K":"0.042","2K":"0.0525"}'::jsonb,
	'{"ratios":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedream/v5.5/edit","readAt":"2026-11-26"},"maxImages":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedream/v5.5/edit","readAt":"2026-11-26"},"imagePrices":{"url":"https://fal.ai/models/bytedance/seedream/v5.5/edit","readAt":"2026-11-26"}}'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
