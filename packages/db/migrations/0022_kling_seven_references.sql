-- Marketing Studio Advanced takes up to 7 reference images, as the reference site does. Kling O3 Pro reference-to-video's image_urls has no maximum
-- in its fal input schema except "Maximum 4 total (elements + reference images) when using video" (read 2026-10-26), and the app sends no video to it,
-- so its app limit rises from 4 to 7. Create Video and UGC Try On keep their own limits (4 images, and exactly 2) in the jobs API.
UPDATE "model_configs" SET "max_images" = 7, "sources" = "sources" || '{"maxImages":{"url":"https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video","readAt":"2026-10-26","note":"no maximum without a video input; 7 is the reference site Advanced limit"}}'::jsonb, "updated_at" = now() WHERE "id" = 'kling-o3-pro';
