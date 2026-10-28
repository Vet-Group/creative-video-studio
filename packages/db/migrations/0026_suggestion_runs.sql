CREATE TABLE "suggestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"cost_usd" numeric(12, 6),
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestion_runs_user_created_idx" ON "suggestion_runs" USING btree ("user_id","created_at");