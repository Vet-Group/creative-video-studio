-- Uploads get a store (owner decision, 2026-11-05: the uploaded-photos picker filters by store): the store chosen on the page at upload, null when none.
ALTER TABLE "assets" ADD COLUMN "store_id" text;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_id_store_id_created_at_idx" ON "assets" USING btree ("owner_id","store_id","created_at");--> statement-breakpoint
-- Backfill: an earlier upload takes the store of its owner's most recent job with a store that ran from it (an input or Create video's end frame).
UPDATE "assets" a SET "store_id" = s.store_id
  FROM (SELECT DISTINCT ON (u.id) u.id, j.store_id
          FROM "jobs" j
         CROSS JOIN LATERAL unnest(j.input_asset_ids || coalesce(string_to_array(j.params->>'endAssetId', ','), '{}')) AS u(id)
          JOIN "assets" x ON x.id = u.id AND x.owner_id = j.user_id AND x.kind = 'input'
         WHERE j.store_id IS NOT NULL
         ORDER BY u.id, j.created_at DESC, j.id DESC) s
 WHERE a.id = s.id;
