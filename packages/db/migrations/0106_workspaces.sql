-- Workspaces, phase 1 (docs/WORKSPACES.md §5): the two tables, the company's workspace with every user in it, and workspace_id on the root rows,
-- filled by its constant default. On Postgres 16 that ADD COLUMN only records the default in the catalog: no table is rewritten, no row trigger
-- fires, so the append-only cost_entries is never updated. drizzle runs the pending migrations in one transaction, so SET LOCAL holds to its end:
-- a lock that waits longer than 10 s on a busy table fails the whole migration, which rolls back, instead of queueing the app behind it.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
-- The company's workspace exists before the workspace_id foreign keys below check the existing rows against it.
INSERT INTO "workspaces" ("id", "name") VALUES ('ws_vet', 'VET Group');--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "fashion_models" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "preset_proposals" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "remakes" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_choices" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "workspace_id" text DEFAULT 'ws_vet' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_name_key" ON "workspaces" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fashion_models" ADD CONSTRAINT "fashion_models_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_proposals" ADD CONSTRAINT "preset_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remakes" ADD CONSTRAINT "remakes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_templates" ADD CONSTRAINT "user_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_workspace_id_idx" ON "analyses" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "assets_workspace_id_created_at_idx" ON "assets" USING btree ("workspace_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "fashion_models_workspace_id_idx" ON "fashion_models" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "feedback_workspace_id_idx" ON "feedback" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "jobs_workspace_id_created_at_idx" ON "jobs" USING btree ("workspace_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "stores_workspace_id_idx" ON "stores" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_choices_workspace_id_idx" ON "user_choices" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_templates_workspace_id_idx" ON "user_templates" USING btree ("workspace_id");--> statement-breakpoint
-- Every existing user joins the company's workspace: an Admin as its owner, everyone else as a member.
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT 'ws_vet', "id", CASE WHEN "role" = 'admin' THEN 'owner' ELSE 'member' END FROM "users";
