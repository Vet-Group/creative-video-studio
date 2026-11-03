-- Provider balances on Admin Costs (owner decision, 2026-11-03; docs/ops/provider-balances.md). Replicate has no balance API, so the Admin enters
-- its prepaid credit and the app counts the ledger's replicate rows since then; the worker turns Replicate off under 2 USD. A balance under
-- balance_warning_usd shows red.
ALTER TABLE "settings" ADD COLUMN "replicate_credit_usd" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "replicate_credit_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "balance_warning_usd" numeric(12, 4) DEFAULT '10' NOT NULL;
