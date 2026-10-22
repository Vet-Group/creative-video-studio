# Implementation plan — Creative Video Studio

Status: draft for owner approval, 2026-10-22; aligned with the deep-interview decisions on 2026-10-23. Where this document and `.omc/plans/creative-video-studio-plan.md` differ, the plan wins. Each step is a vertical slice that ends with a check that actually runs.

## Milestone 0: end-to-end on the mock provider, no cost

| Step | Delivers | Check that proves it |
|---|---|---|
| 0.1 Skeleton | pnpm workspace (`apps/web`, `packages/db`) and docker-compose with Postgres and MinIO for development. `apps/worker` and `packages/core` are added in 0.4, when they first have code. | `pnpm typecheck` and `pnpm test` pass; compose comes up healthy. **Done 2026-10-22, committed locally.** |
| 0.2 Auth | better-auth email/password, Admin creates Members, roles. The password is optional: a user created without one signs in only with Lark. | Integration test: a Member cannot reach Admin routes. **Done 2026-10-22, committed locally:** 9 tests on `/api/admin/users`, including the password-optional cases (R.3), and a mutant of the role check is caught. The login UI comes with 0.6. |
| 0.3 Upload | `POST /api/assets` stores files in MinIO with server-side checks, and an authenticated stream route with `Range` support | Tests: a 5th file, a file over 10 MB and a non-image file are rejected; a `Range` request works; an unauthenticated request gets 401 |
| 0.4 Job with the mock adapter | Teams, stores, the cost ledger and 6 seeded presets. Create Videos form (model picker, optional store) → job and `estimate` ledger row → pg-boss → worker → mock output (a sample MP4 marked `is_mock`) | Test: the job goes through every status and the output lands in MinIO; the ledger rejects UPDATE and DELETE |
| 0.5 Limits | Caps read from the ledger, the 2/5 concurrency, the 10-minute timeout, one manual retry | Tests: a Run over a cap is refused before any adapter call; a 3rd job waits; the timeout fires (shortened clock in tests); a 2nd retry is refused |
| 0.6 Library | Cards, playback, download through a short-lived download token, filters, Reuse, Pass/Fail verdict, soft delete and the purge, the "My jobs" tray with toast and tab title, and the audit log | Playwright: the full flow sign in → upload → Run → tray toast → play → download → Library → Reuse → Pass/Fail; a deletion test covers ownership |
| 0.7 Admin area | Users (password optional, ban, role, team), Teams, Stores, Settings, Presets, the weekly Report, the monthly Costs page with two CSVs, and the audit log page | Tests: a Member is blocked from every admin route; the CSV detail, the CSV summary, the Costs total and the cap usage match to the cent |

Exit condition: all checks green locally, plus a short report that lists what is mock.

## Milestone 1: model bake-off, paid, maximum $40

Order matters. Nothing costs money until step 1.4.

1. **R2 data terms:** done 2026-10-22. Both candidates pass at the platform layer; the model-owner residual risk is described in ARCHITECTURE.
2. **R3 provider schema:** read the real API input schema of each model (images, ratios, durations, resolution), then set the model limits in the adapter. No cost.
3. **Real adapters** for fal (Kling o3 Pro) and Replicate (Seedance 2.5), tested against recorded fixtures. No cost. The fal adapter sends `X-Fal-Store-IO: 0` and an object lifecycle of at least 1 h, and the worker copies the output at once.
4. **Owner action:** create and fund the fal and Replicate accounts, and put the keys in the server `.env`. The keys never go into chat. The plan collects this in a preflight checklist.
5. **Run** a canary (one clip per model, about $3), then the rest of 10 sample images × 2 models = 20 clips, at 9:16, 8 s, with one fixed safe preset. A fixed script copies the 10 images read-only from POD Studio production (5 mockups, 5 product photos, at least 2 with small text) into a folder outside the repo. The run is guarded in code:
   - a hard stop at $40 actual spend, counting the canary, any extra round and the later server smoke clip;
   - no retries; every job is logged to `jobs.jsonl`;
   - a rerun resumes and never submits the same clip twice.
6. **Scoring:** an AI judge scores each clip blind against the 5 faults, with a frame-difference measure for flicker and judder. Results go into `docs/BAKEOFF.md`, with the pass rate and its Wilson 95% interval, the cost per clip and the time each clip took.

Decision (the go/no-go gate):
- **Go** if at least one model reaches 70%: enable every passing model for staff. The pass rates seed the model picker, which pre-selects the model with the higher rate (on a tie, the cheaper one).
- **No-go** if neither reaches 70%: run one extra small round for the better model with a different preset, within the same $40. If it still misses, the app ships with both models disabled and the result is reported. Veo 3.1 or other changes need a new decision and budget.
- Real-provider and deployment work waits for this gate.

## Milestone 2: Lark login and first deployment

1. **R1 Lark OAuth** spike, then the Lark login button. The owner creates the Lark app in the tenant.
2. **R4 VET server check**, read-only: ports, RAM, disk.
3. **Backups** for this app's Postgres and MinIO: a nightly local copy kept 14 days, a weekly encrypted copy to Cloudflare R2, and a restore drill that runs before staff go live and then monthly.
4. **Deploy to VET** under the owner's pre-approval in the plan: the tunnel and `video.vetgroup.net`, neighbour health sampled every 30 s, a smoke test on the server, and `uninstall.sh` as the rollback.

## Needs an owner decision or action

| Item | When |
|---|---|
| Work through the preflight checklist: fal and Replicate accounts prepaid (at most $60 in the bake-off month), the Lark OAuth app, the R2 bucket and key plus the restic password, a Cloudflare token for `vetgroup.net`, the first Admin email and password | Once, before the run; a missing item only skips its steps |
| Run `pnpm preflight`, then type the pre-approval sentence (`pnpm run:approve`) | Once, before the run; it covers the repository, spend, VET access and the deployment, for 14 days |
| Nothing for the sample images: a fixed script copies them and an AI judge scores the clips | Milestone 1, step 5 |
| Real monthly budget, if different from $200 | Any time; it is a setting |

## Costs to confirm

- Milestone 1: about $27.5–29.7 at list price, $40 hard stop.
- Running cost in month 1 (Q5b):
  - The cap is $200; the design volume is 5–7 clips/day; each Member may make 5 clips/day.
  - At list price that volume is about $135–235 a month with Kling, which fits the cap up to about 5 clips/day at the high price. With Seedance it is about $277–389, which does not fit: the cap then allows only about 3–4 clips/day.
  - After one month of real invoices the Admin resets the caps.
