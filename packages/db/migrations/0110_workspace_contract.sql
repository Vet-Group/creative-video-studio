-- Workspaces, phase 2b (docs/WORKSPACES.md §5): drop the constant ws_vet default of workspace_id, so an insert that names no workspace fails
-- instead of filing a partner's row under the company. Every insert has written workspace_id since phase 2. Dropping a default only edits the
-- catalog (no rewrite, no row trigger on the append-only cost_entries); SET LOCAL bounds the wait for each table's lock, as in 0106.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TABLE "analyses" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cost_entries" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "fashion_models" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "preset_proposals" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "remakes" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_choices" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_templates" ALTER COLUMN "workspace_id" DROP DEFAULT;