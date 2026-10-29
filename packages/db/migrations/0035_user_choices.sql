CREATE TABLE "user_choices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"phrase" text NOT NULL,
	"description" text,
	"is_company" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_choices_kind_check" CHECK ("user_choices"."kind" in ('hook', 'location')),
	CONSTRAINT "user_choices_name_check" CHECK (char_length("user_choices"."name") between 1 and 40),
	CONSTRAINT "user_choices_phrase_check" CHECK (char_length("user_choices"."phrase") between 1 and 300),
	CONSTRAINT "user_choices_description_check" CHECK ("user_choices"."description" is null or char_length("user_choices"."description") <= 100)
);
--> statement-breakpoint
ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_choices_user_id_idx" ON "user_choices" USING btree ("user_id");