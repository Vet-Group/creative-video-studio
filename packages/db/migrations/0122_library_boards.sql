CREATE TABLE "library_board_items" (
	"board_id" text NOT NULL,
	"job_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_board_items_board_id_job_id_pk" PRIMARY KEY("board_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "library_boards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_boards_name_check" CHECK (char_length("library_boards"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "library_board_items" ADD CONSTRAINT "library_board_items_board_id_library_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."library_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_board_items" ADD CONSTRAINT "library_board_items_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_boards" ADD CONSTRAINT "library_boards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_boards" ADD CONSTRAINT "library_boards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_board_items_job_id_idx" ON "library_board_items" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_boards_user_name_key" ON "library_boards" USING btree ("user_id","workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "library_boards_workspace_id_idx" ON "library_boards" USING btree ("workspace_id");