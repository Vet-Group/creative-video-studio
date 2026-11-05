-- The choices library by store (owner decision, 2026-11-05): a hook, location or the new ending kind may be shared with one store, carry a niche tag
-- and a photo (one of the owner's uploads); a store entry is not a company one. No row changes: every existing entry stays private or company.
ALTER TABLE "user_choices" DROP CONSTRAINT "user_choices_kind_check";--> statement-breakpoint
ALTER TABLE "user_choices" ADD COLUMN "store_id" text;--> statement-breakpoint
ALTER TABLE "user_choices" ADD COLUMN "niche" text;--> statement-breakpoint
ALTER TABLE "user_choices" ADD COLUMN "image_asset_id" text;--> statement-breakpoint
ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_choices_store_id_kind_idx" ON "user_choices" USING btree ("store_id","kind");--> statement-breakpoint
ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_niche_check" CHECK ("user_choices"."niche" is null or char_length("user_choices"."niche") between 1 and 30);--> statement-breakpoint
ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_scope_check" CHECK (not ("user_choices"."is_company" and "user_choices"."store_id" is not null));--> statement-breakpoint
ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_kind_check" CHECK ("user_choices"."kind" in ('hook', 'location', 'ending'));