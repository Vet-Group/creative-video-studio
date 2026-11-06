-- Owner decision 2026-11-06: of each pair of duplicate models (one model on fal and on an official API, BytePlus ModelArk or Google Vertex) only the cheaper one is
-- offered, and fal wins a tie. `twin_of` marks the dearer row with the row that replaces it: Admin Settings no longer lists it, and the pickers offer it only in place of
-- its twin while that twin cannot serve (it is disabled, its Vertex credits ended, or fal's balance locks it; lib/model-twins.ts). Nothing is deleted, so History and Costs keep the labels.
-- Prices read from prod 2026-11-06 (USD): nano-banana-vertex 0.039 < fal 0.0398; nano-banana-2-vertex 0.067 < 0.08; nano-banana-2.1-vertex 0.034/0.05 < 0.04/0.059;
-- nano-banana-pro-vertex 0.134/0.134/0.24 < 0.15/0.15/0.30; seedream-5-pro-byteplus 0.045/0.09 < 0.0675/0.135; seedance-1.0-pro-byteplus 0.1224 a second < fal 0.124;
-- seedance-2.0-byteplus < fal seedance-2.0 (image to video, disabled); the Vertex Omni rows 0.0695 < fal 0.0819 (disabled until the owner enables them, so the fal rows keep serving);
-- Veo 3.1 costs the same on both ($0.20 silent, $0.40 with sound), so fal's row stays and the Vertex row becomes its fallback.
-- Left visible on purpose: seedance-2.0-reference and seedance-2.5-reference (fal) are listed for Marketing Studio, which the BytePlus rows are not, and the 2.5 rows allow clips up to
-- 30 s against 15 s; seedance-2.5-image (fal) likewise allows 30 s. BytePlus refuses a photo of a real person, so a failed job offers a manual retry on the fal twin (api/jobs, retryOf + twin).
ALTER TABLE "model_configs" ADD COLUMN "twin_of" text;--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_twin_of_model_configs_id_fk" FOREIGN KEY ("twin_of") REFERENCES "public"."model_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_twin_of_check" CHECK ("model_configs"."twin_of" <> "model_configs"."id");--> statement-breakpoint
UPDATE "model_configs" m SET "twin_of" = t.keeper, "updated_at" = now()
FROM (VALUES
	('nano-banana', 'nano-banana-vertex'),
	('nano-banana-2', 'nano-banana-2-vertex'),
	('nano-banana-2.1', 'nano-banana-2.1-vertex'),
	('nano-banana-pro', 'nano-banana-pro-vertex'),
	('seedream-5-pro', 'seedream-5-pro-byteplus'),
	('seedance-1.0-pro', 'seedance-1.0-pro-byteplus'),
	('seedance-2.0', 'seedance-2.0-byteplus'),
	('gemini-omni-flash', 'gemini-omni-flash-vertex'),
	('gemini-omni-flash-reference', 'gemini-omni-flash-reference-vertex'),
	('veo-3.1-vertex', 'veo-3.1')
) AS t (hidden, keeper)
WHERE m."id" = t.hidden;--> statement-breakpoint
-- Veo 3.1 on fal is the visible row now (it was off), and its Vertex twin must be on to serve as the fallback.
UPDATE "model_configs" SET "enabled" = true, "updated_at" = now() WHERE "id" IN ('veo-3.1', 'veo-3.1-vertex');
