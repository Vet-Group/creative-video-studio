-- Template editors (owner decision, 2026-11-04): an Admin lets a user edit the motion presets; every other member proposes a change or a new preset,
-- which one Admin or editor approves (applying it) or rejects.
CREATE TABLE "preset_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"preset_id" text,
	"label" text,
	"prompt" text,
	"enabled" boolean,
	"sort_order" integer,
	"note" text,
	"proposed_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preset_proposals_status_check" CHECK ("preset_proposals"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "preset_proposals_new_check" CHECK ("preset_proposals"."preset_id" is not null or ("preset_proposals"."label" is not null and "preset_proposals"."prompt" is not null)),
	CONSTRAINT "preset_proposals_decided_check" CHECK (("preset_proposals"."status" = 'pending') = ("preset_proposals"."decided_by" is null) and ("preset_proposals"."status" = 'pending') = ("preset_proposals"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "can_edit_templates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preset_proposals" ADD CONSTRAINT "preset_proposals_preset_id_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."presets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_proposals" ADD CONSTRAINT "preset_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_proposals" ADD CONSTRAINT "preset_proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preset_proposals_status_idx" ON "preset_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "preset_proposals_proposed_by_idx" ON "preset_proposals" USING btree ("proposed_by");