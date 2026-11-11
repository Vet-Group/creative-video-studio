CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"image_asset_ids" text[] NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_kind_check" CHECK ("feedback"."kind" in ('feedback', 'bug', 'feature')),
	CONSTRAINT "feedback_status_check" CHECK ("feedback"."status" in ('new', 'reviewing', 'done', 'rejected')),
	CONSTRAINT "feedback_title_check" CHECK (char_length("feedback"."title") between 1 and 120),
	CONSTRAINT "feedback_body_check" CHECK (char_length("feedback"."body") between 1 and 4000),
	CONSTRAINT "feedback_images_check" CHECK (array_length("feedback"."image_asset_ids", 1) is null or array_length("feedback"."image_asset_ids", 1) <= 4),
	CONSTRAINT "feedback_note_check" CHECK ("feedback"."admin_note" is null or char_length("feedback"."admin_note") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "feedback_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_comments_body_check" CHECK (char_length("feedback_comments"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "feedback_votes" (
	"feedback_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_votes_feedback_id_user_id_pk" PRIMARY KEY("feedback_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_votes" ADD CONSTRAINT "feedback_votes_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_votes" ADD CONSTRAINT "feedback_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_comments_feedback_idx" ON "feedback_comments" USING btree ("feedback_id","created_at");