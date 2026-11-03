-- GPT Image 2 at 1K (owner decision, 2026-11-04): fal's pricing table (https://fal.ai/models/openai/gpt-image-2/edit, read 2026-11-04, high quality,
-- one input image) lists 1024x1024 at $0.219, 1024x1536 at $0.178 and 1024x768 at $0.151. The estimate takes the highest, so it never falls below the bill.
UPDATE "model_configs" SET "image_prices" = "image_prices" || '{"1K":"0.219"}'::jsonb,
	"sources" = "sources" || '{"imagePrices":{"url":"https://fal.ai/models/openai/gpt-image-2/edit","readAt":"2026-11-04"}}'::jsonb,
	"updated_at" = now()
WHERE "id" = 'gpt-image-2';
