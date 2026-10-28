ALTER TABLE "model_configs" ADD COLUMN "max_prompt_chars" integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_max_prompt_chars_check" CHECK ("model_configs"."max_prompt_chars" > 0);--> statement-breakpoint
-- Each model's prompt limit, the `maxLength` of `prompt` in its fal queue schema (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>),
-- read 2026-10-28. A schema that states none (Seedance, Wan, Kling o3 and v3, Flux 3, Bria, Topaz, Seedream) keeps 2000, the limit every model had before.
-- The app caps every limit at PROMPT_CEILING (5000, packages/core/src/models.ts).
UPDATE "model_configs" m SET "max_prompt_chars" = v.n,
  "sources" = m."sources" || jsonb_build_object('maxPromptChars', jsonb_build_object('url', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' || m."endpoint", 'readAt', '2026-10-28'))
FROM (VALUES
  ('fal-ai/nano-banana/edit', 50000), ('fal-ai/nano-banana-2/edit', 50000), ('fal-ai/nano-banana-pro/edit', 50000), ('google/nano-banana-2.1/edit', 50000),
  ('openai/gpt-image-2/edit', 32000), ('openai/gpt-image-2.5/flare/edit', 32000), ('openai/gpt-image-2.5/sunburst/edit', 32000),
  ('fal-ai/kling-video/o1/reference-to-video', 2500), ('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', 2500), ('fal-ai/kling-video/v2.6/pro/image-to-video', 2500),
  ('fal-ai/minimax/hailuo-2.3/pro/image-to-video', 2000),
  ('fal-ai/veo3.1/image-to-video', 20000), ('google/gemini-omni-flash/v1.1/image-to-video', 20000), ('google/gemini-omni-flash/v1.1/reference-to-video', 20000),
  ('minimax/h3-max/image-to-video', 50000), ('minimax/h3-max/reference-to-video', 50000),
  ('xai/grok-imagine-video/reference-to-video', 4096), ('xai/grok-imagine-video/v1.5/image-to-video', 4096)
) AS v(endpoint, n)
WHERE m."provider" = 'fal' AND m."endpoint" = v.endpoint;
