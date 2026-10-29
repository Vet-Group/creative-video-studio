-- More reference images and ratios, as the fal input schemas allow (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>, read 2026-10-29).
-- References: Minimax H3 Max Reference (all three resolutions) and Seedance 2.0 Reference take 9 (maxItems 9), Gemini Omni Flash Reference 9 (fal
-- allows 10; Fash offers 9), Grok Imagine Reference 7 (maxItems 7). Create Video now takes up to 9 images, still capped by each row (the jobs API).
-- Minimax bills reference tokens past the 4,096 free per request (about 1,000 per extra image at 768P, $0.02 per 1,000), which the estimate leaves out.
-- Ratios: each row whose request sends aspect_ratio gains those of 16:9, 4:3 and 3:4 that its endpoint's enum lists, after its own; Motion Control
-- rows keep 'auto'. Endpoints without aspect_ratio crop the first image to the ratio and keep theirs.
UPDATE "model_configs" SET "max_images" = r.n,
	"sources" = "sources" || jsonb_build_object('maxImages', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || "model_configs"."endpoint", 'readAt', '2026-10-29'))
FROM (VALUES ('minimax/h3-max/reference-to-video', 9), ('bytedance/seedance-2.0/us/reference-to-video', 9), ('google/gemini-omni-flash/v1.1/reference-to-video', 9), ('xai/grok-imagine-video/reference-to-video', 7)) AS r(endpoint, n)
WHERE "provider" = 'fal' AND "model_configs"."endpoint" = r.endpoint;
--> statement-breakpoint
UPDATE "model_configs" SET "ratios" = "ratios" || ARRAY(SELECT x FROM unnest(r.more) WITH ORDINALITY AS u(x, i) WHERE x <> ALL ("ratios") ORDER BY i),
	"sources" = "sources" || jsonb_build_object('ratios', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || "model_configs"."endpoint", 'readAt', '2026-10-29'))
FROM (VALUES
	('fal-ai/kling-video/o3/pro/reference-to-video', ARRAY['16:9']),
	('fal-ai/kling-video/o1/reference-to-video', ARRAY['16:9']),
	('bytedance/seedance-2.5/us/reference-to-video', ARRAY['16:9', '4:3', '3:4']),
	('bytedance/seedance-2.0/us/reference-to-video', ARRAY['16:9', '4:3', '3:4']),
	('bytedance/seedance-2.0/us/image-to-video', ARRAY['16:9', '4:3', '3:4']),
	('fal-ai/bytedance/seedance/v1.5/pro/image-to-video', ARRAY['16:9', '4:3', '3:4']),
	('fal-ai/bytedance/seedance/v1/pro/image-to-video', ARRAY['16:9', '4:3', '3:4']),
	('blackforestlabs/flux-3/keyframes-to-video', ARRAY['16:9', '4:3', '3:4']),
	('blackforestlabs/flux-3/image-to-video', ARRAY['16:9', '4:3', '3:4']),
	('google/gemini-omni-flash/v1.1/reference-to-video', ARRAY['16:9']),
	('google/gemini-omni-flash/v1.1/image-to-video', ARRAY['16:9']),
	('fal-ai/veo3.1/image-to-video', ARRAY['16:9']),
	('xai/grok-imagine-video/reference-to-video', ARRAY['16:9', '4:3', '3:4']),
	('fal-ai/wan/v2.7/reference-to-video', ARRAY['16:9', '4:3', '3:4']),
	('minimax/h3-max/reference-to-video', ARRAY['16:9', '4:3', '3:4'])
) AS r(endpoint, more)
WHERE "provider" = 'fal' AND "model_configs"."endpoint" = r.endpoint AND NOT 'motion_control' = ANY("features") AND NOT r.more <@ "ratios";
