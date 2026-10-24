-- The bake-off spend (plan B.7), one shared "bakeoff" ledger row per provider for the ICT month it was spent (2026-10-24, 16:08 to 19:31 ICT).
-- The amounts are what each provider billed, as the Billed line of docs/BAKEOFF.md records from their usage pages (not the cap-guard count):
-- fal: 10 kling-o3-pro clips (image 1 is the canary), 40 billed seconds at 0.14 = 5.60. Replicate: 8 succeeded seedance-2.5 clips at 1.156 =
-- 9.248; the image 6 failure, the 2 off-script probes and image 9 (never reached Replicate) were not billed.
INSERT INTO "cost_entries" ("kind", "usd", "month", "provider", "model", "is_final", "ref", "note") VALUES
	('bakeoff', '5.6000', '2026-10', 'fal', 'kling-o3-pro', true, 'bakeoff-2026-10-fal', 'Bake-off spend: 10 clips'),
	('bakeoff', '9.2480', '2026-10', 'replicate', 'seedance-2.5', true, 'bakeoff-2026-10-replicate', 'Bake-off spend: 8 billed clips') ON CONFLICT ("ref") DO NOTHING;
