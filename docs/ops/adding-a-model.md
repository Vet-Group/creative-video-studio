# Adding a video model

A new video model is never enabled on trust. It first passes a mini bake-off, and the result is stored as its bake-off record. An Admin cannot enable a real video model that has no record (AC 22): `PUT /api/admin/settings` answers 400 `no bake-off record for <id>`. Image models and mock models are not covered by this rule.

## 1. Add the model and its adapter

1. Read the provider's official input schema and price page. Record each fact (ratios, durations, image limit, output resolution, price per second, the response field that carries the billed amount, or none) with its URL and read date, as `BAKEOFF_MODELS` does in `packages/core/src/models.ts`.
2. If the provider is not fal or Replicate, add an adapter next to `packages/core/src/providers/fal.ts` and wire it in `apps/worker/src/real-providers.ts`. The worker uses an adapter only when its key is set (`FAL_KEY`, `REPLICATE_API_TOKEN`).
3. Add the `model_configs` row in a migration, disabled, with the facts above and no bake-off record (`pass_seed_passes` and `pass_seed_total` stay null).

## 2. Run the mini bake-off

The rules are the ones of the main bake-off (`docs/BAKEOFF.md`):

- the same 10 input images, the same safe preset, 9:16, the thrift duration and resolution of the model (`scripts/bakeoff/run.ts`, set `half-1` then `half-2`, `--models <id>`);
- the same blind judging against the 5 faults (`scripts/bakeoff/rubric.md`), reported by `scripts/bakeoff/report.ts`, which recomputes every number;
- the same bar: at least 70% of the clips pass. A clip that never rendered for a reason on the provider's side counts as a fail; one lost on our side is left out and named in the report.

The run spends real money. It needs the funding gate and the owner's spend limit, like the main bake-off. A model that misses the bar gets no record and stays disabled.

## 3. Store the record

In a migration, set `pass_seed_passes` and `pass_seed_total` of the row to the passes and the total of the report. They seed the pass rate in the picker; from then on it is `(seed passes + marked passes) / (seed n + marked n)`, counting marked clips only. Commit the updated report. Keep `BAKEOFF_MODELS` and the row in step: `packages/db/src/schema.test.ts` compares them with `docs/BAKEOFF.md`.

## 4. Enable it

An Admin switches the model on in Settings. The server checks, in this order, that the model exists, that a real video model has a bake-off record, and that its price and limits are recorded. Each change is audited as `model.set_enabled`. A disabled model is not listed in the picker and a Run that names it is refused (400).

Before enabling Seedance 2.5: Replicate dropped a create request with a JSON body of about 3.8 MB, so inputs near the 10 MB upload limit need downscaling first, and a run takes about 27 minutes against the worker's 10-minute run timeout (`DEFAULT_OPTIONS.runTimeoutMs`).
