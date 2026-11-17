CREATE TABLE "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text,
	"score" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_score_check" CHECK ("ratings"."score" between 1 and 10),
	CONSTRAINT "ratings_comment_check" CHECK ("ratings"."comment" is null or char_length("ratings"."comment") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rating_snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ratings_created_idx" ON "ratings" USING btree ("created_at");