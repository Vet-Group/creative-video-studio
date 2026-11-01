-- The fal Seedance 2.0 row is off since 2026-11-01 (owner: use the Replicate credits first, one row per model), so the
-- Replicate twin is the only Seedance 2.0 people see and no longer needs its provider suffix.
UPDATE "model_configs" SET "label" = 'Seedance 2.0' WHERE "id" = 'seedance-2.0-replicate' AND "label" = 'Seedance 2.0 (Replicate)';
