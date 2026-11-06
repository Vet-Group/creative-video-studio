-- Gemini Omni Flash moves from fal's v1.1 to v1.2 in place (owner decision, 2026-11-06): the rows keep their ids (history and jobs.model stay intact) and their
-- enabled state. Facts read 2026-11-06 from the v1.2 OpenAPI schemas (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=google/gemini-omni-flash/v1.2/<image-to-video|reference-to-video|text-to-video>):
-- the same input fields as v1.1, aspect_ratio 16:9 and 9:16 (the rows already list both), prompt maxLength 20000, reference images maxItems 10 (the row stays at 9),
-- resolution 360p to 4k (the builders still ask 720p) and duration an integer from 3 to 15 (v1.1: 3 to 10). Image-to-video takes at most 10 s when an end image
-- is sent (VIDEO_BODIES endMaxSec). Price from https://fal.ai/models/google/gemini-omni-flash/v1.2/image-to-video: $0.0819 per second at 720p (v1.1: $0.10).
-- Every source URL moves to v1.2 and its readAt to 2026-11-06; the Reference row's nativeAudio note keeps its own date (the paid test of 2026-11-04 ran on v1.1;
-- Google states 1.2 generates native audio too). The endpoint test makes a second run a no-op.
UPDATE "model_configs" m SET
	"endpoint" = v.new_endpoint,
	"durations_sec" = ARRAY[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]::integer[],
	"usd_per_second" = 0.0819,
	"sources" = (
		SELECT jsonb_object_agg(s.key, CASE WHEN s.key = 'nativeAudio' THEN jsonb_set(s.value, '{note}', '"no generate_audio field; the owner-approved paid test of 2026-11-04 heard real speech at the stored price on v1.1, and Google states v1.2 also generates native audio"') ELSE jsonb_set(s.value, '{readAt}', '"2026-11-06"') END)
		FROM jsonb_each(replace(m."sources"::text, '/v1.1/', '/v1.2/')::jsonb) AS s
	),
	"updated_at" = now()
FROM (VALUES
	('google/gemini-omni-flash/v1.1/image-to-video', 'google/gemini-omni-flash/v1.2/image-to-video'),
	('google/gemini-omni-flash/v1.1/reference-to-video', 'google/gemini-omni-flash/v1.2/reference-to-video')
) AS v(old_endpoint, new_endpoint)
WHERE m."provider" = 'fal' AND m."endpoint" = v.old_endpoint;
