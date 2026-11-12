CREATE TABLE "fashion_models" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"asset_id" text NOT NULL,
	"traits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"shared_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "fashion_models_name_check" CHECK (char_length("fashion_models"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_feature_check";--> statement-breakpoint
ALTER TABLE "fashion_models" ADD CONSTRAINT "fashion_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fashion_models" ADD CONSTRAINT "fashion_models_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fashion_models_user_id_idx" ON "fashion_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fashion_models_asset_id_idx" ON "fashion_models" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_feature_check" CHECK ("jobs"."feature" in ('video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover', 'motion_control', 'media_optimizer', 'jewelry_try_on', 'lingerie_try_on', 'fashion_model'));--> statement-breakpoint
-- Fashion Model Generator makes a person from words alone, on Nano Banana 2: the fal row and the Vertex row that serves in its place (twin_of, 0075). Its soft cap matches Jewelry Try-On.
INSERT INTO "feature_caps" ("feature", "monthly_usd") VALUES ('fashion_model', 10) ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "model_configs" SET "features" = array_append("features", 'fashion_model') WHERE "id" IN ('nano-banana-2', 'nano-banana-2-vertex') AND NOT ('fashion_model' = ANY("features"));
