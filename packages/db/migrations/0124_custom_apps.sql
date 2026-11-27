CREATE TABLE "custom_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_job_id" text NOT NULL,
	"feature" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"aspect" text NOT NULL,
	"duration_s" integer NOT NULL,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_apps_feature_check" CHECK ("custom_apps"."feature" in ('video', 'image')),
	CONSTRAINT "custom_apps_category_check" CHECK ("custom_apps"."category" in ('fashion', 'photo', 'video', 'utility')),
	CONSTRAINT "custom_apps_name_check" CHECK (char_length("custom_apps"."name") between 1 and 60),
	CONSTRAINT "custom_apps_description_check" CHECK (char_length("custom_apps"."description") <= 200),
	CONSTRAINT "custom_apps_prompt_check" CHECK (char_length("custom_apps"."prompt") between 1 and 5000),
	CONSTRAINT "custom_apps_aspect_check" CHECK ("custom_apps"."aspect" in ('auto', '1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9', '4:1', '1:4', '8:1', '1:8'))
);
--> statement-breakpoint
ALTER TABLE "custom_apps" ADD CONSTRAINT "custom_apps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_apps" ADD CONSTRAINT "custom_apps_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_apps" ADD CONSTRAINT "custom_apps_model_model_configs_id_fk" FOREIGN KEY ("model") REFERENCES "public"."model_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_apps" ADD CONSTRAINT "custom_apps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_apps_workspace_id_published_at_idx" ON "custom_apps" USING btree ("workspace_id","published_at");