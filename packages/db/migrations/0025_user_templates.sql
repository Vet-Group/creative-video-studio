CREATE TABLE "user_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"is_company" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_templates_name_check" CHECK (char_length("user_templates"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "user_templates" ADD CONSTRAINT "user_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_templates_user_id_idx" ON "user_templates" USING btree ("user_id");