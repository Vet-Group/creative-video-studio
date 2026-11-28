-- Agent OAuth (apps/web/src/lib/oauth.ts): MCP clients register themselves (oauth_clients), an Admin approves one on /oauth/authorize, which makes an
-- api_tokens connection (kind oauth) and a single-use code; the code becomes a one-hour access token and a rotating 30-day refresh token. Only sha256 hashes are stored.
CREATE TABLE "oauth_access_tokens" (
	"hash" "bytea" PRIMARY KEY NOT NULL,
	"api_token_id" text NOT NULL,
	"client_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"registered_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_consent_at" timestamp with time zone,
	CONSTRAINT "oauth_clients_name_check" CHECK (char_length("oauth_clients"."name") between 1 and 80),
	CONSTRAINT "oauth_clients_redirect_uris_check" CHECK (cardinality("oauth_clients"."redirect_uris") between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"code_hash" "bytea" PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"api_token_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"hash" "bytea" PRIMARY KEY NOT NULL,
	"api_token_id" text NOT NULL,
	"client_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"replaced_by" "bytea",
	"grace" text
);
--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_api_token_id_idx" ON "oauth_access_tokens" USING btree ("api_token_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_pending_idx" ON "oauth_clients" USING btree ("created_at") WHERE "oauth_clients"."first_consent_at" is null;--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_api_token_id_idx" ON "oauth_refresh_tokens" USING btree ("api_token_id");--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE restrict ON UPDATE no action;