-- Billing teams (docs/BILLING.md, owner decisions 2026-11-20): a sales team is `billable` with a free monthly allowance (`free_monthly_usd`, 20 USD unless
-- set), a company store may belong to a team (`stores.team_id`), and `billing_month_closes` freezes a month's billing figures once accounting has read it.
-- No data changes: the Admin marks the real teams and their stores after the deploy. SET LOCAL bounds the wait for each table's lock, as in 0106.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE TABLE "billing_month_closes" (
	"month" text PRIMARY KEY NOT NULL,
	"as_of" bigint NOT NULL,
	"buckets" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_month_closes_month_check" CHECK ("billing_month_closes"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "billable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "free_monthly_usd" numeric(12, 4) DEFAULT '20' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_month_closes" ADD CONSTRAINT "billing_month_closes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stores_team_id_idx" ON "stores" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_free_monthly_usd_check" CHECK ("teams"."free_monthly_usd" >= 0);