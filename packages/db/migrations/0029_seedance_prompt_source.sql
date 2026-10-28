-- Replicate Seedance 2.5: its schema (https://replicate.com/bytedance/seedance-2.5/api/schema, read 2026-10-28) caps `prompt` at 2000 characters,
-- the value 0028 left it with by default; this records where that comes from.
UPDATE "model_configs" SET "sources" = "sources" || jsonb_build_object('maxPromptChars', jsonb_build_object('url', 'https://replicate.com/bytedance/seedance-2.5/api/schema', 'readAt', '2026-10-28'))
WHERE "provider" = 'replicate' AND "endpoint" = 'bytedance/seedance-2.5' AND "max_prompt_chars" = 2000;
