-- Seedream 4.5 and 4.0 on BytePlus, for the owner's free packs (200 images each, valid to 2028-11-03); both rows start disabled until an Admin switches them on.
-- Ids and prices: https://docs.byteplus.com/en/docs/modelark/model-pricing (image generation models, read 2026-11-04): seedream-4-5-251128 $0.04 per image,
-- seedream-4-0-250828 $0.03 per image, input images free, one price at every size. GET /api/v3/models also lists seedream-4-0-20260415, which has no price
-- there, so the priced 250828 is the row. Sizes (https://ai.byteplus.com/ark/region:ap-southeast-1/docs/image-generation-api.md, read 2026-11-04): 4.0 takes
-- 1K, 2K and 4K (921,600 pixels at least); 4.5 takes 2K and 4K only (3,686,400 pixels at least), so its row prices 2K alone and offers no 1K. The adapter
-- has no 4K target, so neither row lists it. Features, ratios and limits come from the fal Seedream 5.0 Pro row, as for the 5.0 rows (0056).
INSERT INTO "model_configs" ("id", "provider", "endpoint", "label", "kind", "features", "ratios", "durations_sec", "max_images", "max_prompt_chars", "image_prices", "sources")
SELECT v.id, 'byteplus', v.endpoint, v.label, 'image', m."features", m."ratios", ARRAY[]::integer[], m."max_images", m."max_prompt_chars", v.prices::jsonb,
	jsonb_build_object(
		'imagePrices', jsonb_build_object('url', 'https://docs.byteplus.com/en/docs/modelark/model-pricing', 'readAt', '2026-11-04'),
		'endpoint', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-list.md', 'readAt', '2026-11-04'),
		'size', jsonb_build_object('url', 'https://ai.byteplus.com/ark/region:ap-southeast-1/docs/image-generation-api.md', 'readAt', '2026-11-04'),
		'ratios', m."sources"->'ratios', 'maxImages', m."sources"->'maxImages', 'maxPromptChars', m."sources"->'maxPromptChars')
FROM (VALUES
	('seedream-4.5-byteplus', 'seedream-4-5-251128', 'Seedream 4.5 (BytePlus)', '{"2K":"0.04"}'),
	('seedream-4.0-byteplus', 'seedream-4-0-250828', 'Seedream 4.0 (BytePlus)', '{"1K":"0.03","2K":"0.03"}')
) AS v (id, endpoint, label, prices)
JOIN "model_configs" m ON m."id" = 'seedream-5-pro'
ON CONFLICT ("id") DO NOTHING;
