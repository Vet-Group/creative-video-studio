-- GPT Image 2 measured price (owner decision, 2026-11-04): fal bills it by tokens, input image included, so its pricing table is only an example.
-- One real 2K run (job 3b17279d, 1632x2176, one input image) cost $0.3001 on fal's usage API against the $0.234 estimate, 1.2825x.
-- All three sizes are scaled by that factor and rounded up, so the estimate no longer falls below the bill.
UPDATE "model_configs" SET "image_prices" = "image_prices" || '{"1K":"0.281","2K":"0.301","4K":"0.530"}'::jsonb,
	"sources" = "sources" || '{"imagePrices":{"url":"https://api.fal.ai/v1/models/usage?endpoint_id=openai/gpt-image-2/edit","readAt":"2026-11-04"}}'::jsonb,
	"updated_at" = now()
WHERE "id" = 'gpt-image-2';
