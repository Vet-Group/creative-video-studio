ALTER TABLE "model_configs" ADD COLUMN "thinking_prices" jsonb;--> statement-breakpoint
-- A price per thinking level on Nano Banana 2.1 (owner decision, 2026-10-30): fal and Vertex bill 2.1 by tokens, so High costs more than one price per image
-- says, and neither states a price per level. Fash's own credits for Nano Banana 2.1 (https://fash.studio/dashboard/image-generation, read 2026-10-30) are
-- 1K 11/13/17, 2K 16/17/21 and 4K 32/33/37 for Minimal/Medium/High. Minimal, the default (first) level, keeps the row's image_prices; Medium and High
-- scale it by Fash's ratio for the resolution (1K High = price x 17/11), rounded to 4 decimals. Neither row sells 4K, so only 1K and 2K are priced.
UPDATE "model_configs" SET "thinking_prices" = r.prices::jsonb,
	"sources" = "sources" || jsonb_build_object('thinkingPrices', jsonb_build_object('url', 'https://fash.studio/dashboard/image-generation', 'readAt', '2026-10-30', 'note', 'ratio of Fash credits, not a provider price'))
FROM (VALUES
	('nano-banana-2.1', '{"minimal":{"1K":"0.04","2K":"0.059"},"medium":{"1K":"0.0473","2K":"0.0627"},"high":{"1K":"0.0618","2K":"0.0774"}}'),
	('nano-banana-2.1-vertex', '{"minimal":{"1K":"0.034","2K":"0.05"},"medium":{"1K":"0.0402","2K":"0.0531"},"high":{"1K":"0.0525","2K":"0.0656"}}')
) AS r(id, prices)
WHERE "model_configs"."id" = r.id;
