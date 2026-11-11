ALTER TABLE "feedback" DROP CONSTRAINT "feedback_images_check";--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_images_check" CHECK (array_length("feedback"."image_asset_ids", 1) is null or array_length("feedback"."image_asset_ids", 1) <= 20);
