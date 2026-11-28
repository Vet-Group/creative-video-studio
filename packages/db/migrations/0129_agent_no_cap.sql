-- Agent access drops the per-connection monthly USD cap (owner decision 2026-11-28): an agent Run is held by the same team and company caps as a
-- browser Run. Existing caps are dropped with the column; each connection's month spend is still read from the ledger (tokenMonthSpend).
-- A personal access token may now never expire (expires_at null), so the PAT check only asks for its secret hash.
ALTER TABLE "api_tokens" DROP CONSTRAINT "api_tokens_cap_check";--> statement-breakpoint
ALTER TABLE "api_tokens" DROP CONSTRAINT "api_tokens_pat_check";--> statement-breakpoint
ALTER TABLE "api_tokens" DROP COLUMN "monthly_cap_usd";--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_pat_check" CHECK ("api_tokens"."kind" <> 'pat' or "api_tokens"."secret_hash" is not null);