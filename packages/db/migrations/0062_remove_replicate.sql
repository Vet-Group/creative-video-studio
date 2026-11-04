-- Replicate removed (owner decision, 2026-11-04: its credit is spent; Vertex and BytePlus are the primary providers, fal the fallback). No adapter submits to
-- Replicate any more. A row with history stays, disabled, because jobs.model references model_configs.id ON DELETE RESTRICT and reports read the old jobs and
-- ledger rows; a row that no job and no ledger row names is deleted. The 'replicate' value stays in the provider checks so that history keeps reading.
-- The settings.replicate_credit_* columns stay too: nothing reads them now, and dropping them is a schema change with no gain.
DELETE FROM "model_configs" m WHERE m."provider" = 'replicate'
	AND NOT EXISTS (SELECT 1 FROM "jobs" j WHERE j."model" = m."id")
	AND NOT EXISTS (SELECT 1 FROM "cost_entries" c WHERE c."model" = m."id");
--> statement-breakpoint
UPDATE "model_configs" SET "enabled" = false, "updated_at" = now() WHERE "provider" = 'replicate' AND "enabled";
