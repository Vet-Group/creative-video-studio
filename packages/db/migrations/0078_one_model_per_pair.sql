-- Owner decisions 2026-11-08, following 0075 (one row of each duplicate pair is offered, the cheaper one).
-- 1. Model names lose their provider suffix: Admin Settings groups the rows under their provider, Costs has a provider column, and the pickers offer one row of a pair,
--    so a member never sees two rows of one name side by side.
-- 2. BytePlus Seedance 2.0 and 2.5 already send the product photos as reference images (core/providers/byteplus.ts, 1 to 9), as the fal reference rows do, at
--    $0.1512 against $0.37 (2.0) and $0.2312 against $0.473 (2.5) a second. They now serve Marketing Studio too, and the fal rows become their twins. A pair acts
--    as one model: a request the BytePlus row cannot make (a clip over 15 s, a reference video or audio, an end frame, more images) runs on its enabled fal twin
--    (lib/model-twins.ts servingRow), and a photo BytePlus refuses for a real person can still be re-run on fal (api/jobs onTwin).
UPDATE "model_configs" SET "label" = regexp_replace("label", ' \((BytePlus|Vertex)\)$', ''), "updated_at" = now() WHERE "label" ~ ' \((BytePlus|Vertex)\)$';--> statement-breakpoint
UPDATE "model_configs" SET "features" = array_append("features", 'marketing'), "updated_at" = now()
WHERE "id" IN ('seedance-2.0-byteplus', 'seedance-2.5-byteplus') AND NOT ('marketing' = ANY ("features"));--> statement-breakpoint
UPDATE "model_configs" m SET "twin_of" = t.keeper, "updated_at" = now()
FROM (VALUES
	('seedance-2.0-reference', 'seedance-2.0-byteplus'),
	('seedance-2.5-reference', 'seedance-2.5-byteplus'),
	('seedance-2.5-image', 'seedance-2.5-byteplus')
) AS t (hidden, keeper)
WHERE m."id" = t.hidden;
