-- The bake-off spend (plan B.7), one shared "bakeoff" ledger row per provider for the ICT month it was spent (2026-10-24, 16:08 to 19:31 ICT).
-- Each key counts at the larger of its estimate and the reported cost, as scripts/bakeoff/jobs.ts spend() does over out/jobs.jsonl.
-- fal: 10 kling-o3-pro clips (image 1 is the canary) at 0.56 = 5.60. Replicate: 10 seedance-2.5 clips at 1.156 (image 6 failed but was
-- billed; image 9 ended unknown and keeps its estimate) plus 2 off-script probes at 1.156 = 13.872. They match docs/BAKEOFF.md's Spend line.
INSERT INTO "cost_entries" ("kind", "usd", "month", "provider", "model", "is_final", "ref", "note") VALUES
	('bakeoff', '5.6000', '2026-10', 'fal', 'kling-o3-pro', true, 'bakeoff-2026-10-fal', 'Bake-off spend: 10 clips'),
	('bakeoff', '13.8720', '2026-10', 'replicate', 'seedance-2.5', true, 'bakeoff-2026-10-replicate', 'Bake-off spend: 10 clips and 2 probes') ON CONFLICT ("ref") DO NOTHING;
