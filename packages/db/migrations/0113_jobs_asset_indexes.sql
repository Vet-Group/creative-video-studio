-- An asset of another member's Library clip is read through readableAsset (apps/web/src/lib/assets.ts) on every thumbnail and range request: it asks
-- whether a live clip names the asset as its output, poster or input. Without an index per arm of that OR each request read every job of the workspace.
-- A plain CREATE INDEX blocks writes to jobs while it builds (the migrator runs in a transaction, so not CONCURRENTLY); SET LOCAL bounds the wait for the table's lock, as in 0106.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE INDEX "jobs_output_asset_id_idx" ON "jobs" USING btree ("output_asset_id");--> statement-breakpoint
CREATE INDEX "jobs_poster_asset_id_idx" ON "jobs" USING btree ("poster_asset_id");--> statement-breakpoint
CREATE INDEX "jobs_input_asset_ids_idx" ON "jobs" USING gin ("input_asset_ids");