-- Replicate dropped for good (owner decision, 2026-11-05: delete every leftover, keep the money). Migration 0062 removed the adapter and kept a disabled
-- 'replicate' model row, the 'replicate' provider value and the settings.replicate_credit_* columns only so that history kept reading. Nothing references
-- the row any more except the October 2026 bake-off line of cost_entries. That line is not touched: cost_entries is append-only (a trigger refuses UPDATE),
-- cost_entries.model is plain text with no foreign key, and Admin Costs only left-joins model_configs for a label, so month totals do not change.
-- A plain DELETE: if a job still named one of these rows, jobs.model (ON DELETE RESTRICT) would fail the migration, which is what we want.
DELETE FROM "model_configs" WHERE "provider" = 'replicate';
--> statement-breakpoint
ALTER TABLE "model_configs" DROP CONSTRAINT "model_configs_provider_check";
--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_provider_check" CHECK ("model_configs"."provider" in ('fal', 'vertex', 'byteplus', 'mock'));
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_provider_check";
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_provider_check" CHECK ("jobs"."provider" in ('fal', 'vertex', 'byteplus', 'mock'));
--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "replicate_credit_usd";
--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "replicate_credit_since";
