ALTER TABLE "jobs" DROP CONSTRAINT "jobs_aspect_check";--> statement-breakpoint
ALTER TABLE "model_configs" ADD COLUMN "thinking_levels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_aspect_check" CHECK ("jobs"."aspect" in ('auto', '1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9', '4:1', '1:4', '8:1', '1:8'));--> statement-breakpoint
-- The ultra-wide ratios and the thinking level, as Fash offers them: 4:1, 1:4, 8:1 and 1:8 on Nano Banana 2 and 2.1 only, and Minimal, Medium and High
-- on Nano Banana 2.1 only (its Image Generation and Try On pages, read 2026-10-30). The fal schemas (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>)
-- list the four ratios on both edit endpoints and their text twins, and thinking_level minimal, medium and high on google/nano-banana-2.1/edit and its twin.
-- Vertex lists the same ratios for gemini-3.1-flash-image and gemini-nano-banana-2.1 (their model pages) and thinkingConfig.thinkingLevel MINIMAL, MEDIUM
-- and HIGH for Nano Banana 2.1 (models/thinking). Both price 2.1 by tokens, so a level changes the thinking tokens billed, not a price per image; the
-- stored prices stay. Nano Banana Pro's schemas list the ratios too, and fal-ai/nano-banana-2/edit a minimal or high level; Fash offers neither, so they are left.
UPDATE "model_configs" SET "ratios" = "ratios" || ARRAY['4:1', '1:4', '8:1', '1:8'],
	"sources" = "sources" || jsonb_build_object('ratios', jsonb_build_object('url', r.url, 'readAt', '2026-10-30'))
FROM (VALUES
	('nano-banana-2', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/nano-banana-2/edit'),
	('nano-banana-2.1', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=google/nano-banana-2.1/edit'),
	('nano-banana-2-vertex', 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image'),
	('nano-banana-2.1-vertex', 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1')
) AS r(id, url)
WHERE "model_configs"."id" = r.id AND '21:9' = ANY("ratios") AND NOT '4:1' = ANY("ratios");--> statement-breakpoint
UPDATE "model_configs" SET "thinking_levels" = ARRAY['minimal', 'medium', 'high'],
	"sources" = "sources" || jsonb_build_object('thinkingLevels', jsonb_build_object('url', r.url, 'readAt', '2026-10-30'))
FROM (VALUES
	('nano-banana-2.1', 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=google/nano-banana-2.1/edit'),
	('nano-banana-2.1-vertex', 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking')
) AS r(id, url)
WHERE "model_configs"."id" = r.id;
