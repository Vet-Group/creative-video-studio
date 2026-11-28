-- Agent access (apps/web/src/lib/agent-access.ts): a connection (api_tokens) acts as its creator in one workspace under its own monthly USD cap, and every agent write
-- needs a single-use confirm (agent_confirms). The rows an agent creates, and the ledger rows booked for them, name the connection in api_token_id.
CREATE TABLE "agent_confirms" (
	"nonce" text PRIMARY KEY NOT NULL,
	"api_token_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"result_status" integer,
	"result_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" "bytea",
	"oauth_client_id" text,
	"monthly_cap_usd" numeric(12, 4) DEFAULT '20' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_reason" text,
	CONSTRAINT "api_tokens_secret_hash_unique" UNIQUE("secret_hash"),
	CONSTRAINT "api_tokens_kind_check" CHECK ("api_tokens"."kind" in ('pat', 'oauth')),
	CONSTRAINT "api_tokens_name_check" CHECK (char_length("api_tokens"."name") between 1 and 60),
	CONSTRAINT "api_tokens_cap_check" CHECK ("api_tokens"."monthly_cap_usd" >= 0),
	CONSTRAINT "api_tokens_pat_check" CHECK ("api_tokens"."kind" <> 'pat' or ("api_tokens"."expires_at" is not null and "api_tokens"."secret_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "api_token_id" text;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD COLUMN "api_token_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "api_token_id" text;--> statement-breakpoint
ALTER TABLE "remakes" ADD COLUMN "api_token_id" text;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD COLUMN "api_token_id" text;--> statement-breakpoint
ALTER TABLE "agent_confirms" ADD CONSTRAINT "agent_confirms_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens" USING btree ("user_id") WHERE "api_tokens"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remakes" ADD CONSTRAINT "remakes_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_entries_api_token_id_month_idx" ON "cost_entries" USING btree ("api_token_id","month") WHERE "cost_entries"."api_token_id" is not null;
