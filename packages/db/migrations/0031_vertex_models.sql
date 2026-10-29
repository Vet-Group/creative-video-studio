-- Vertex AI as a third provider (plan A6, 2026-10-29): Google's own API for the Nano Banana models, 11-20% under fal's price, plus Virtual Try-On and
-- Product Recontext, which fal does not sell. Every row starts disabled; an Admin switches one on in Settings once its canary has passed.
-- Prices: https://cloud.google.com/vertex-ai/generative-ai/pricing (read 2026-10-29), output image only; each input image adds about $0.001.
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_provider_check";--> statement-breakpoint
ALTER TABLE "model_configs" DROP CONSTRAINT "model_configs_provider_check";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_provider_check" CHECK ("jobs"."provider" in ('fal', 'replicate', 'vertex', 'mock'));--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_provider_check" CHECK ("model_configs"."provider" in ('fal', 'replicate', 'vertex', 'mock'));
--> statement-breakpoint
-- The Nano Banana rows take features, ratios, image limit and prompt limit, with their sources, from their fal twins: the same Google models, so only
-- the endpoint, label and price differ.
-- Vertex ids: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-generation (read 2026-10-29).
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "image_prices", "sources")
SELECT v.id, 'vertex', v.endpoint, v.label, 'image', m."features", m."ratios", ARRAY[]::integer[], m."max_images", m."max_prompt_chars", v.prices::jsonb,
	jsonb_build_object(
		'imagePrices', jsonb_build_object('url', 'https://cloud.google.com/vertex-ai/generative-ai/pricing', 'readAt', '2026-10-29'),
		'endpoint', jsonb_build_object('url', 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-generation', 'readAt', '2026-10-29'),
		'ratios', m."sources"->'ratios', 'maxImages', m."sources"->'maxImages', 'maxPromptChars', m."sources"->'maxPromptChars')
FROM (VALUES
	('nano-banana-pro-vertex', 'nano-banana-pro', 'gemini-3-pro-image', 'Nano Banana Pro (Vertex)', '{"1K":"0.134","2K":"0.134","4K":"0.24"}'),
	('nano-banana-2-vertex', 'nano-banana-2', 'gemini-3.1-flash-image', 'Nano Banana 2 (Vertex)', '{"1K":"0.067"}'),
	('nano-banana-2.1-vertex', 'nano-banana-2.1', 'gemini-nano-banana-2.1', 'Nano Banana 2.1 (Vertex)', '{"1K":"0.034","2K":"0.05"}'),
	('nano-banana-vertex', 'nano-banana', 'gemini-2.5-flash-image', 'Nano Banana (Vertex)', '{"1K":"0.039"}')
) AS v (id, twin, endpoint, label, prices)
JOIN "model_configs" m ON m."id" = v.twin
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Virtual Try-On takes one person image and one garment image and keeps the person image's shape, so its only ratio is 'auto'; it reads no prompt.
-- Product Recontext places one to three images of a product in the scene the prompt describes; Google grants access to it through a request form.
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "image_prices", "sources") VALUES
	('virtual-try-on-vertex', 'vertex', 'virtual-try-on-001', 'Virtual Try-On (Vertex)', 'image', ARRAY['try_on']::text[], ARRAY['auto']::text[], ARRAY[]::integer[], 2, '{"1K":"0.06"}'::jsonb,
		'{"imagePrices":{"url":"https://cloud.google.com/vertex-ai/generative-ai/pricing","readAt":"2026-10-29"},"endpoint":{"url":"https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/generate-virtual-try-on-images","readAt":"2026-10-29"}}'::jsonb),
	('product-recontext-vertex', 'vertex', 'imagen-product-recontext-preview-06-30', 'Product Recontext (Vertex)', 'image', ARRAY['image']::text[], ARRAY['auto']::text[], ARRAY[]::integer[], 3, '{"1K":"0.12"}'::jsonb,
		'{"imagePrices":{"url":"https://cloud.google.com/vertex-ai/generative-ai/pricing","readAt":"2026-10-29"},"endpoint":{"url":"https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-product-recontext-api","readAt":"2026-10-29"}}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
