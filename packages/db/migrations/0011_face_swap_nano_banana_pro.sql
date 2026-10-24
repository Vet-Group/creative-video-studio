-- Face Swap moves to Nano Banana Pro, still disabled (an Admin switches it on in Settings). On 2026-10-24 fal marked easel-ai/advanced-face-swap deprecated
-- ("This model is no longer supported") and its results returned HTTP 503. In a live check the same day the base Nano Banana edit returned the target photo
-- unchanged, while Nano Banana Pro put the source face on the target and kept the body, clothes and background. The new row is a third row of the Character
-- Swap endpoint at its USD 0.15 per image; the Easel row keeps any jobs that name it but no longer serves a feature.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "image_prices", "sources") VALUES
	('nano-banana-pro-face-swap', 'fal', 'fal-ai/nano-banana-pro/edit', 'Nano Banana Pro (Face Swap)', 'image', ARRAY['face_swap']::text[], ARRAY['auto']::text[], ARRAY[]::integer[], 2, '{"1K":"0.15"}'::jsonb, '{"ratios":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/nano-banana-pro/edit","readAt":"2026-10-24"},"maxImages":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/nano-banana-pro/edit","readAt":"2026-10-24"},"imagePrices":{"url":"https://fal.ai/models/fal-ai/nano-banana-pro/edit","readAt":"2026-10-24"}}'::jsonb) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "model_configs" SET "features" = ARRAY[]::text[], "enabled" = false WHERE "id" = 'easel-advanced-face-swap';
