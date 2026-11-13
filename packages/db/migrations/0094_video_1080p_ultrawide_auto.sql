-- Create Video gaps against Fash (owner-approved 2026-11-14): a 1080p Seedance and the ratios 21:9 and auto.
-- 21:9 goes only to rows whose provider schema takes it: every fal endpoint below lists it in its aspect_ratio enum (openapi read 2026-11-14,
-- https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>) for the image or reference endpoint and for the text-to-video twin a no-image Run uses;
-- the BytePlus Seedance rows send `ratio` as it is and the API lists 21:9 for all of them (https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md).
-- `auto` (the output follows the input image) goes only to image-to-video rows whose schema takes it: Seedance 2.0 and 1.5 Pro and 1.0 Pro ("auto" in the enum), Seedance 2.5
-- (its image-to-video schema has aspect_ratio "always auto") and FLUX 3. The reference endpoints and BytePlus take no "follow the image" value (their auto or adaptive lets the model
-- pick from the prompt), and a Run with no image has nothing to follow, so the app offers auto only with an image (api/models, api/jobs).
-- Left out: Kling (no 21:9, and only the video-to-video reference has auto), Veo 3.1 and Gemini Omni (16:9 and 9:16), Grok Imagine and WAN 2.7 (no 21:9), and the Minimax H3 Max
-- image-to-video rows (no ratio field).
UPDATE "model_configs" SET "ratios" = array_append("ratios", '21:9'), "sources" = "sources" || jsonb_build_object('ratiosUltrawide', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || "endpoint", 'readAt', '2026-11-14')), "updated_at" = now()
WHERE "id" IN ('seedance-2.5-reference', 'seedance-2.0', 'seedance-2.0-reference', 'seedance-1.5-pro', 'seedance-1.0-pro', 'flux-3', 'flux-3-reference', 'minimax-h3-max-reference', 'minimax-h3-max-reference-480p', 'minimax-h3-max-reference-1080p') AND NOT '21:9' = ANY("ratios");--> statement-breakpoint
UPDATE "model_configs" SET "ratios" = array_append("ratios", '21:9'), "sources" = "sources" || jsonb_build_object('ratiosUltrawide', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md', 'readAt', '2026-11-14')), "updated_at" = now()
WHERE "id" IN ('seedance-1.0-pro-byteplus', 'seedance-1.0-pro-fast-byteplus', 'seedance-2.0-byteplus', 'seedance-2.0-fast-byteplus', 'seedance-2.0-mini-byteplus', 'seedance-2.5-byteplus') AND NOT '21:9' = ANY("ratios");--> statement-breakpoint
UPDATE "model_configs" SET "ratios" = array_append("ratios", 'auto'), "sources" = "sources" || jsonb_build_object('ratiosAuto', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || "endpoint", 'readAt', '2026-11-14')), "updated_at" = now()
WHERE "id" IN ('seedance-2.5-image', 'seedance-2.0', 'seedance-1.5-pro', 'seedance-1.0-pro', 'flux-3', 'flux-3-reference') AND NOT 'auto' = ANY("ratios");--> statement-breakpoint
-- Seedance 2.5 at 1080p beside the 720p row, as Minimax H3 Max has its 480P and 1080P rows (0036): the same fal endpoint, and the adapter sends the row's output resolution.
-- fal's page for the endpoint (https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video, read 2026-11-14) prices 1080p at roughly $1.164 per second of video
-- ($0.0234 per 1,000 tokens; 480p $0.2205, 720p $0.473, which the 720p row stores); sound costs nothing more. The row copies everything else from its 720p row, ratios included,
-- is no twin of anything, and starts disabled: an Admin enables it after a canary.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources")
SELECT m."id" || '-1080p', m."provider", m."endpoint", m."label" || ' 1080p', m."kind", m."features", m."ratios", m."durations_sec", m."max_images", m."max_prompt_chars", '1080p', 1.164,
	m."sources" || jsonb_build_object('outputResolution', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || m."endpoint", 'readAt', '2026-11-14'), 'usdPerSecond', jsonb_build_object('url', 'https://fal.ai/models/' || m."endpoint", 'readAt', '2026-11-14'))
FROM "model_configs" m
WHERE m."id" = 'seedance-2.5-image'
ON CONFLICT ("id") DO NOTHING;
