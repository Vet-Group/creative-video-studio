-- Owner decision 2026-11-08: model names are written one way, as their makers write them, now that 0078 dropped the provider suffix.
UPDATE "model_configs" SET "label" = 'Kling O1', "updated_at" = now() WHERE "label" = 'Kling o1';--> statement-breakpoint
UPDATE "model_configs" SET "label" = 'Veo 3.1', "updated_at" = now() WHERE "label" = 'Google VEO 3.1';--> statement-breakpoint
UPDATE "model_configs" SET "label" = regexp_replace("label", '^Minimax ', 'MiniMax '), "updated_at" = now() WHERE "label" ~ '^Minimax ';--> statement-breakpoint
UPDATE "model_configs" SET "label" = regexp_replace("label", '^WAN ', 'Wan '), "updated_at" = now() WHERE "label" ~ '^WAN ';--> statement-breakpoint
UPDATE "model_configs" SET "label" = regexp_replace("label", ' (\d+)P$', ' \1p'), "updated_at" = now() WHERE "label" ~ ' \d+P$';
