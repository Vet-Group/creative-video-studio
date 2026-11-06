-- Gemini Omni 1.2 Flash on Vertex AI (owner decision, 2026-11-06), the primary twin of the two Omni rows with their fal rows (0073, v1.2) as the fallback, the
-- arrangement of Veo 3.1 (0042) and the Nano Banana rows (0031). Served by core/providers/vertex-omni.ts through the Interactions API (the model has no GenerateContent);
-- model id gemini-omni-1.2-flash, location global only, GA 2026-11-05 (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-2-flash, read 2026-11-06).
-- The rows copy their fal twins (features, ratios, 3 to 15 s, image limit, prompt limit, pass prior) and start disabled: the owner enables them after the canary. The ratios
-- are Google's 16:9 and 9:16, the output 720p. Price: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing (read 2026-11-06) lists $12.00 per 1M
-- video output tokens and 5,792 tokens per second of 720p video with audio, which is $0.0695 a second (the launch blog says "$0.07 per second of 720p video"). It is an ESTIMATE:
-- text and image input ($1.50 per 1M, 1,120 tokens per image) and thought tokens ($9.00 per 1M) are billed too and not counted, under 5% of a 5 s clip; compare the first canary
-- with Billing Reports. Omni always makes sound, so audio on costs the stored price (ALWAYS_AUDIO in core/models.ts).
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "pass_seed_passes", "pass_seed_total", "sources")
SELECT v.id, 'vertex', 'gemini-omni-1.2-flash', v.label, "kind", "features",
	ARRAY(SELECT r FROM unnest("ratios") r WHERE r IN ('16:9', '9:16')), "durations_sec", "max_images", "max_prompt_chars", '720p', 0.0695, "pass_seed_passes", "pass_seed_total",
	("sources" - ARRAY['endpoint', 'ratios', 'durationsSec', 'outputResolution', 'usdPerSecond', 'billedAmountField', 'nativeAudio']) || '{
		"endpoint": {"url": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-2-flash", "readAt": "2026-11-06"},
		"ratios": {"url": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text", "readAt": "2026-11-06"},
		"durationsSec": {"url": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text", "readAt": "2026-11-06"},
		"outputResolution": {"url": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text", "readAt": "2026-11-06"},
		"usdPerSecond": {"url": "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing", "readAt": "2026-11-06", "note": "estimate: $12.00 per 1M video output tokens x 5,792 tokens per second of 720p video with audio = $0.0695; the launch blog states $0.07; input and thought tokens not counted"},
		"nativeAudio": {"url": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-2-flash", "readAt": "2026-11-06", "note": "Google states native audio (speech, music, sound effects) and the video pages show no switch to turn it off; not yet heard on Vertex"}
	}'::jsonb
FROM (VALUES
	('gemini-omni-flash-vertex', 'gemini-omni-flash', 'Gemini Omni Flash (Vertex)'),
	('gemini-omni-flash-reference-vertex', 'gemini-omni-flash-reference', 'Gemini Omni Flash Reference (Vertex)')
) AS v (id, twin, label)
JOIN "model_configs" m ON m."id" = v.twin
ON CONFLICT ("id") DO NOTHING;
