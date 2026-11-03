ALTER TABLE "cost_entries" DROP CONSTRAINT "cost_entries_kind_check";--> statement-breakpoint
ALTER TABLE "cost_entries" DROP CONSTRAINT "cost_entries_job_shared_check";--> statement-breakpoint
ALTER TABLE "cost_entries" DROP CONSTRAINT "cost_entries_shared_unattributed_check";--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_llm_check" CHECK ("cost_entries"."kind" <> 'llm' or ("cost_entries"."user_id" is not null and "cost_entries"."team_id" is not null and "cost_entries"."day" is not null and "cost_entries"."ref" is not null and ("cost_entries"."job_id" is null) = "cost_entries"."is_final"));--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_kind_check" CHECK ("cost_entries"."kind" in ('estimate', 'actual_adjustment', 'release', 'late_bill', 'bakeoff', 'manual_adjustment', 'invoice_diff', 'store_reassign', 'llm'));--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_job_shared_check" CHECK ("cost_entries"."kind" = 'llm' or ("cost_entries"."job_id" is null) = ("cost_entries"."kind" in ('bakeoff', 'manual_adjustment', 'invoice_diff')));--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_shared_unattributed_check" CHECK ("cost_entries"."job_id" is not null or "cost_entries"."kind" = 'llm' or ("cost_entries"."user_id" is null and "cost_entries"."team_id" is null and "cost_entries"."store_id" is null));--> statement-breakpoint
-- LLM calls in the ledger (owner decision, 2026-11-04): Enhance, AI suggestions and translations book an `llm` row (packages/core/src/ledger.ts bookLlm).
-- Backfill the costs recorded before, at the ledger's 4 decimals; a cost that rounds to 0 books nothing. The ref makes a rerun book nothing.
-- Enhance always ran google/gemini-2.5-flash on fal (ENHANCE_MODEL since #105). A job's llm row never closes it, so is_final stays false.
INSERT INTO "cost_entries" ("kind", "usd", "month", "day", "user_id", "team_id", "store_id", "job_id", "provider", "model", "is_final", "ref")
SELECT 'llm', round("enhance_cost_usd", 4), to_char("created_at" at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), ("created_at" at time zone 'Asia/Ho_Chi_Minh')::date,
       "user_id", "team_id", "store_id", "id", 'fal', 'google/gemini-2.5-flash', false, 'llm:enhance:' || "id"
  FROM "jobs" WHERE round("enhance_cost_usd", 4) > 0
ON CONFLICT ("ref") DO NOTHING;--> statement-breakpoint
-- Suggestion and translation runs have no job: the row names the member and the member's team now, and is final.
INSERT INTO "cost_entries" ("kind", "usd", "month", "day", "user_id", "team_id", "provider", "model", "is_final", "ref")
SELECT 'llm', round(r."cost_usd", 4), to_char(r."created_at" at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), (r."created_at" at time zone 'Asia/Ho_Chi_Minh')::date,
       r."user_id", u."team_id", 'fal', 'google/gemini-2.5-flash', true, 'llm:suggestion:' || r."id"
  FROM "suggestion_runs" r JOIN "users" u ON u."id" = r."user_id" WHERE round(r."cost_usd", 4) > 0
ON CONFLICT ("ref") DO NOTHING;
