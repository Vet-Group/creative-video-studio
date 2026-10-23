CREATE TABLE "audit_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- verdicts is empty in every environment (nothing wrote it before this migration), so the NOT NULL column needs no backfill.
ALTER TABLE "verdicts" ADD COLUMN "job_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "verdicts" ALTER COLUMN "output_asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entries_created_at_idx" ON "audit_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entries_target_idx" ON "audit_entries" USING btree ("target");--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_job_id_unique" UNIQUE("job_id");
