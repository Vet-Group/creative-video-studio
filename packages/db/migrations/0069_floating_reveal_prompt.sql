-- floating-reveal's clip shows two small golden rods sliding into a round opening in the floor under the hovering product, then coming back out. The
-- prompt 0065 wrote left them out. The owner approved this text on 2026-11-05 after a prompt-from-video call on the clip described them. A prompt an
-- Admin or editor has already changed is left as it is; the change is audited as preset.update by the system (no actor).
WITH v(id, old_prompt, new_prompt) AS (VALUES
	('floating-reveal', 'The product hovers in mid-air at the centre of the frame above a seamless, warm pastel floor, bobbing very gently, with a soft shadow on the ground beneath it. The camera stays still, and soft, even studio lighting keeps the scene clean and minimal. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.', 'The product hovers in mid-air at the centre of the frame above a small round opening in a seamless, warm pastel floor, bobbing very gently. Two small golden rods slide across the floor, tip into the opening and disappear, then come back out and slide apart. The camera stays still, and soft, even studio lighting keeps the scene clean and minimal. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.')
), changed AS (
	UPDATE "presets" p SET "prompt" = v.new_prompt, "updated_at" = now()
	FROM v
	WHERE p."id" = v.id AND p."prompt" = v.old_prompt
	RETURNING p."id", v.old_prompt, p."prompt"
)
INSERT INTO "audit_entries" ("actor_id", "action", "target", "old_value", "new_value")
SELECT NULL, 'preset.update', 'preset:' || c."id", jsonb_build_object('prompt', c.old_prompt), jsonb_build_object('prompt', c."prompt")
FROM changed c;
