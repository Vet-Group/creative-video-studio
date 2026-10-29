-- Nano Banana Pro, 2 and 2.1 combine up to 14 reference images (https://fal.ai/models/fal-ai/nano-banana-pro/edit, https://fal.ai/models/fal-ai/nano-banana-2/edit,
-- https://fal.ai/models/google/nano-banana-2.1/edit and https://ai.google.dev/gemini-api/docs/image-generation, read 2026-10-29); 0007 set 4, which their schemas never said.
UPDATE "model_configs" SET "max_images" = 14, "sources" = "sources" || jsonb_build_object('maxImages', jsonb_build_object('url', 'https://fal.ai/models/' || "endpoint", 'readAt', '2026-10-29')), "updated_at" = now()
WHERE "id" IN ('nano-banana-pro', 'nano-banana-2', 'nano-banana-2.1') AND "max_images" = 4;
