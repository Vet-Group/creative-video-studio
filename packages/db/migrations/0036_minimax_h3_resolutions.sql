-- Minimax H3 Max at 480P and 1080P, beside the 768P rows of 0015, as Fash offers them. Same fal endpoints; the adapter sends each row's output
-- resolution. fal prices per second (https://fal.ai/models/minimax/h3-max/image-to-video, read 2026-10-29; the 35% promotion until 2026-10-31 is
-- not stored): 480P $0.05, 768P $0.08, 1080P $0.16. 1080P is a latent refinement of a native 768P render (the schema's own words), and the worker
-- takes a 480P output at the row's own floor. The rows copy everything else from their 768P twins and start disabled until a canary passes.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources")
SELECT m."id" || '-' || r.res, m."provider", m."endpoint", m."label" || ' ' || upper(r.res), m."kind", m."features", m."ratios", m."durations_sec", m."max_images", m."max_prompt_chars", r.res, r.usd,
	m."sources" || jsonb_build_object('outputResolution', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || m."endpoint", 'readAt', '2026-10-29'), 'usdPerSecond', jsonb_build_object('url', 'https://fal.ai/models/' || m."endpoint", 'readAt', '2026-10-29'))
FROM "model_configs" m CROSS JOIN (VALUES ('480p', 0.05), ('1080p', 0.16)) AS r(res, usd)
WHERE m."id" IN ('minimax-h3-max', 'minimax-h3-max-reference')
ON CONFLICT ("id") DO NOTHING;
