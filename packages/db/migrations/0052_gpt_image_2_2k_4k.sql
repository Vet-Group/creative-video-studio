-- GPT Image 2 at 2K and 4K (owner decision, 2026-11-03). fal has no 2K/4K label for it, so packages/core/src/providers/fal.ts sends a custom image_size
-- per ratio with no more pixels than the 2560x1440 and 3840x2160 rows of fal's pricing table (https://fal.ai/models/openai/gpt-image-2/edit, read
-- 2026-11-03: high quality, one input image, $0.234 and $0.413), which are the prices here; 1K keeps its price. The limits (edges in multiples of 16,
-- a 3840 px edge, at most 8,294,400 pixels) are in the image_size description of the same model's text-to-image schema; the edit schema states none.
-- fal bills by tokens, and its table prices only 16:9 at these sizes, so the other ratios at the same pixels are estimated at the 16:9 price.
UPDATE "model_configs" SET "image_prices" = "image_prices" || '{"2K":"0.234","4K":"0.413"}'::jsonb,
	"sources" = "sources" || '{"largeImagePrices":{"url":"https://fal.ai/models/openai/gpt-image-2/edit","readAt":"2026-11-03"},"largeImageSizes":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=openai/gpt-image-2","readAt":"2026-11-03"}}'::jsonb,
	"updated_at" = now()
WHERE "id" = 'gpt-image-2';
