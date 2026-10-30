-- Kling O3 Pro, Kling 3.0 Pro and both Kling 3.0 Motion Control endpoints take a 2500-character prompt: their fal schemas
-- (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>, read 2026-10-30) put maxLength 2500 inside the prompt's anyOf, which 0028
-- read as "states none" and left at 2000. Fash's General template prompt runs on Kling o3 Pro Reference and is refused at 2000 here.
UPDATE "model_configs" SET "max_prompt_chars" = 2500,
	"sources" = "sources" || jsonb_build_object('maxPromptChars', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || "endpoint", 'readAt', '2026-10-30'))
WHERE "provider" = 'fal' AND "max_prompt_chars" = 2000 AND "endpoint" IN (
	'fal-ai/kling-video/o3/pro/reference-to-video',
	'fal-ai/kling-video/v3/pro/image-to-video',
	'fal-ai/kling-video/v3/pro/motion-control',
	'fal-ai/kling-video/v3/standard/motion-control'
);
