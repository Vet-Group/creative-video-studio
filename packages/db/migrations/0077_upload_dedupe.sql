ALTER TABLE "assets" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "slot" text;--> statement-breakpoint
CREATE INDEX "assets_owner_id_sha256_idx" ON "assets" USING btree ("owner_id","sha256");--> statement-breakpoint
-- Owner decision 2026-11-06: the uploaded-photos picker opens on the photos of the slot it was opened from. An input uploaded before this is put in the slot
-- of the first job that used it (lib/upload-slots.ts keys): Try On's person, garments and background; UGC Marketing Studio's model and product, and
-- Advanced's references; Create video's photos and end frame; Image Generation's photos. An input only an app used, or none, keeps null and shows under "Tất cả".
WITH uses AS (
	SELECT u.asset_id, u.slot, j.created_at
	FROM jobs j
	CROSS JOIN LATERAL (
		SELECT i.id AS asset_id,
			CASE
				WHEN j.feature = 'try_on' THEN CASE WHEN i.n = 1 THEN 'model' WHEN i.n <= 1 + CASE WHEN j.params->>'garments' ~ '^[0-9]+$' THEN (j.params->>'garments')::int ELSE cardinality(j.input_asset_ids) - 1 END THEN 'garment' ELSE 'background' END
				WHEN j.feature = 'marketing' AND j.params->>'format' = 'advanced' THEN 'reference'
    WHEN j.feature = 'marketing' AND j.params->>'roles' IS NOT NULL THEN nullif(split_part(j.params->>'roles', ',', i.n::int), '')
				WHEN j.feature = 'marketing' THEN CASE i.n WHEN 1 THEN 'model' WHEN 2 THEN 'product' END
				WHEN j.feature = 'video' THEN 'video'
				WHEN j.feature = 'image' THEN 'image'
			END AS slot
		FROM unnest(j.input_asset_ids) WITH ORDINALITY AS i(id, n)
		UNION ALL
		SELECT j.params->>'endAssetId', 'end-frame' WHERE j.params->>'endAssetId' IS NOT NULL
	) u
	WHERE u.slot IS NOT NULL
)
UPDATE "assets" a SET "slot" = f.slot
FROM (SELECT DISTINCT ON (asset_id) asset_id, slot FROM uses ORDER BY asset_id, created_at) f
WHERE a."id" = f.asset_id AND a."kind" = 'input' AND a."slot" IS NULL;
