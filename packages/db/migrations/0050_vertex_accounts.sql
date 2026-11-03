-- Vertex accounts used in order (owner decision, 2026-11-03; docs/ops/vertex-accounts.md). cvs-vertex has a FreeTrial credit of 7,825,800 VND
-- expiring 2026-12-30 and must stop before its card is charged; the worker's credits guard writes settings.vertex_active_project and audits the
-- switch with no actor (the system), so audit_entries.actor_id may now be null.
CREATE TABLE "vertex_accounts" (
	"project_id" text PRIMARY KEY NOT NULL,
	"credit_total" numeric,
	"credit_currency" text DEFAULT 'USD' NOT NULL,
	"credit_expires_on" date,
	"stop_when_credits_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_entries" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "vertex_active_project" text;--> statement-breakpoint
INSERT INTO "vertex_accounts" ("project_id", "credit_total", "credit_currency", "credit_expires_on", "stop_when_credits_end") VALUES ('cvs-vertex', 7825800, 'VND', '2026-12-30', true);
