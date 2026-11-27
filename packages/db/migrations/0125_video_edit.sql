ALTER TABLE "jobs" DROP CONSTRAINT "jobs_feature_check";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_feature_check" CHECK ("jobs"."feature" in ('video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover', 'motion_control', 'media_optimizer', 'jewelry_try_on', 'lingerie_try_on', 'fashion_model', 'multi_angle', 'breed_swap', 'pet_portrait', 'mockup_pack', 'name_swap', 'pose_generator', 'product_recolor', 'listing_set', 'hook_effect', 'video_edit'));--> statement-breakpoint
-- Video edit app (owner pick 2026-11-27, apps/web/src/lib/apps.ts): one job feature, `video_edit`, a 30 USD soft cap, and its one model row, disabled until an Admin enables it after a paid canary.
-- Kling O3 Standard Edit (schema read 2026-11-27 from https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/standard/video-to-video/edit): video_url (MP4 or MOV,
-- 3 to 15.05 s, 720 to 3840 px a side, 23 to 60 fps, at most 200 MB), prompt (up to 2,500 characters), keep_audio, and no ratio or duration field, so the output follows the clip: ratio auto,
-- the whole seconds 3 to 15 (the job's duration is the clip's, rounded up), one input (the clip). fal bills $0.14 per output second (pricing read the same day). The output resolution is not
-- stated; 720p is the floor the worker checks.
INSERT INTO "feature_caps" ("feature", "monthly_usd") VALUES ('video_edit', 30) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "output_resolution", "usd_per_second", "sources", "enabled") VALUES
	('kling-o3-edit-standard', 'fal', 'fal-ai/kling-video/o3/standard/video-to-video/edit', 'Kling O3 Edit Standard', 'video', ARRAY['video_edit']::text[], ARRAY['auto']::text[], ARRAY[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]::integer[], 1, 2500, '720p', 0.14,
	jsonb_build_object(
		'ratios', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/standard/video-to-video/edit', 'readAt', '2026-11-27'),
		'durationsSec', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/standard/video-to-video/edit', 'readAt', '2026-11-27'),
		'maxImages', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/standard/video-to-video/edit', 'readAt', '2026-11-27'),
		'maxPromptChars', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/standard/video-to-video/edit', 'readAt', '2026-11-27'),
		'outputResolution', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/standard/video-to-video/edit', 'readAt', '2026-11-27'),
		'usdPerSecond', jsonb_build_object('url', 'https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit', 'readAt', '2026-11-27')),
	false)
ON CONFLICT ("id") DO NOTHING;
