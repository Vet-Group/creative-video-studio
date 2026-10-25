# Adding a video model

Since 2026-10-25 the owner keeps every model open, as on Fash: an Admin can enable any model whose price and limits are recorded, with or without a bake-off record (this replaces the 70% gate of AC 22). The record, or a public leaderboard result for a model without one, is the prior of the model's recommendation score.

## The recommendation score

`apps/web/src/lib/model-scores.ts` computes it on every request: quality is `(seed passes + marked passes) / (seed n + marked n)` (0.5 while nothing is counted), reliability is `(succeeded + 4) / (succeeded + failed + 4)` over the model's real jobs, and the score is `100 x quality x reliability`. Image pickers count the marks and jobs of their own feature. The model that scores above every other choice of a picker (and of each kind on Explore) carries the "Đề xuất" badge, and the video picker pre-selects the best score.

## 1. Add the model and its adapter

1. Read the provider's official input schema and price page. Record each fact (ratios, durations, image limit, output resolution, price per second, the response field that carries the billed amount, or none) with its URL and read date, as `BAKEOFF_MODELS` does in `packages/core/src/models.ts`.
2. If the provider is not fal or Replicate, add an adapter next to `packages/core/src/providers/fal.ts` and wire it in `apps/worker/src/real-providers.ts`. The worker uses an adapter only when its key is set (`FAL_KEY`, `REPLICATE_API_TOKEN`).
3. Add the `model_configs` row in a migration, disabled, with the facts above and no bake-off record (`pass_seed_passes` and `pass_seed_total` stay null).

## 2. Run the mini bake-off

The rules are the ones of the main bake-off (`docs/BAKEOFF.md`):

- the same 10 input images, the same safe preset, 9:16, the thrift duration and resolution of the model (`scripts/bakeoff/run.ts`, set `half-1` then `half-2`, `--models <id>`);
- the same blind judging against the 5 faults (`scripts/bakeoff/rubric.md`), reported by `scripts/bakeoff/report.ts`, which recomputes every number;
- the same bar: at least 70% of the clips pass. A clip that never rendered for a reason on the provider's side counts as a fail; one lost on our side is left out and named in the report.

The run spends real money. It needs the funding gate and the owner's spend limit, like the main bake-off. A model that misses the bar keeps its record; it can still be enabled, and its lower score keeps the badge on a better model.

## 3. Store the record

In a migration, set `pass_seed_passes` and `pass_seed_total` of the row to the passes and the total of the report. They seed the pass rate in the picker; from then on it is `(seed passes + marked passes) / (seed n + marked n)`, counting marked clips only. Commit the updated report. Keep `BAKEOFF_MODELS` and the row in step: `packages/db/src/schema.test.ts` compares them with `docs/BAKEOFF.md`.

## 4. Enable it

An Admin switches the model on in Settings. The server checks that the model exists and that its price and limits are recorded. Each change is audited as `model.set_enabled`. A disabled model is not listed in the picker and a Run that names it is refused (400).

Input images are sent inline. In the bake-off Replicate reset a create request with a JSON body of about 3.8 MB, so the worker shrinks each input to at most 600 KB and 2048 px (`apps/worker/src/real-providers.ts`), and `resolveImages` refuses inputs that still add up to more than 3.6 MB before any call. Seedance 2.5 rendered each 5 s clip in 134-159 s; from the office PC the download from `replicate.delivery` was the slow part (about 25 minutes), which the worker's 10-minute run timeout (`DEFAULT_OPTIONS.runTimeoutMs`) would not survive, so check that download from the server before Seedance ever passes a new bake-off.
