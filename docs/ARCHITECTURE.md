# Architecture — Creative Video Studio (MVP)

Status: draft, aligned with the plan on 2026-10-23 (where they differ, the plan wins). Items marked **[approved]** come from grilling (`docs/STATUS.md`); items marked **[proposed]** need owner approval.

## Shape

```
Browser ── Next.js web (UI + route handlers) ──┐
                                               ├── Postgres (app data + pg-boss queue)
           worker (pg-boss consumer) ──────────┤
               │                               └── MinIO (inputs, outputs)
               └── VideoProvider adapter ── mock | fal | replicate
```

## Stack [approved]

The stack is reused from `dev/work/ideas-hub`, so deployment, backup and debugging work the same way as the existing app.

| Concern | Choice | Notes |
|---|---|---|
| Web | Next.js + TypeScript | Same as Ideas Hub `apps/web` |
| Worker | Node + TypeScript, separate process | Same as Ideas Hub `apps/worker` |
| DB | Postgres 16 + Drizzle | Its own instance, not shared with Ideas Hub or POD Studio |
| Queue | pg-boss | Supplies queueing, the per-user and global concurrency limits, the 10-minute expiry and the retry state |
| Storage | MinIO (S3 API, `@aws-sdk/client-s3`) | Its own instance. Provider URLs are copied into MinIO at once. |
| Auth | better-auth: email/password (the password is optional per user), plus Lark through generic OAuth | Lark is allow-list only: a user signs in with Lark only if an Admin added their email. A user created without a password can sign in only with Lark. The Lark sign-in accepts only the company tenant (`tenant_key`) and only the `enterprise_email`, never a personal email. **Unverified:** whether Lark works with better-auth's generic OAuth (RESEARCH-GAPS R1) |
| Runtime | On the VET Linux server: Postgres and MinIO in the compose project `creative-video-studio`; web and worker as root user systemd units `cvs-web` and `cvs-worker` (each with `MemoryMax`), on a pinned Node under `/opt/creative-video-studio/node`; reached through the Cloudflare tunnel at `video.vetgroup.net` | Deploy only under the owner's pre-approval in the plan (section 3). `uninstall.sh` is the rollback |
| Tests | Vitest (unit and integration against real Postgres and MinIO in compose) + Playwright on the mock provider (the Member flow, the Admin flow, a Member blocked from Admin pages, a mobile viewport) | |

Layout [proposed]: a pnpm workspace with `apps/web`, `apps/worker` and `packages/db`. Provider adapters live in `packages/core`. This mirrors Ideas Hub.

## Data model [proposed]

- **`users`, `sessions`, `accounts`**: better-auth tables. `users.role` is `member` or `admin`. `users.banned` blocks sign-in. `users.team_id` is required and cannot be changed by the user. Users are banned, never deleted.
- **`teams`, `stores`**: managed by an Admin and hidden, never deleted. A team has a name and an optional cost-centre code. A store has a name and a unique code that equals POD Studio's `store_id`; the code cannot change once the store has cost. A default team is seeded, and existing users move into it.
- **`assets`**: `id`, `owner_id`, `kind` (`input`/`output`), `s3_key`, `mime`, `bytes`, `width`, `height`, `created_at`, `deleted_at`.
- **`jobs`**:
  - Request: `id`, `user_id`, `model`, `provider`, `prompt`, `aspect` (`9:16`/`1:1`), `duration_s` (5–10), `input_asset_ids[]`.
  - Attribution: `team_id` (a snapshot of the user's team at Run) and an optional `store_id`.
  - State: `status` (`queued`/`submitting`/`running`/`succeeded`/`failed`/`failed_unknown`/`timed_out`), `retry_of`.
  - Provider: `provider_job_id`, `error`, `is_mock`. **There are no money columns**: cost lives only in the cost ledger.
  - Result and timing: `output_asset_id`, `created_at`, `started_at`, `finished_at`, `deleted_at`, `purged_at`.
- **`cost_entries`, `monthly_rates`, `provider_invoices`**: the cost ledger and its inputs. See "Cost ledger".
- **`model_configs`**: per model, the limits, price per second, whether it is enabled, and the pass-rate seed.
- **`presets`**: a Vietnamese label, an English prompt, `enabled` and `is_bakeoff_safe`. Six are seeded.
- **`verdicts`**: Pass or Fail per output clip (unique per output asset), the fault for a Fail, and who marked it.
- **`audit_entries`**: who, when, what, and the old and new values.
- **`worker_heartbeat`**: written by the worker; the UI shows "worker offline" after 60 s without it.
- **`settings`**: one row with `monthly_cap_usd` (200) and `member_daily_clip_cap` (5).

## Job lifecycle

1. `POST /api/jobs` checks the request in one database transaction:
   - the session and the inputs;
   - the caps: the ICT month's ledger sum against the monthly cap, and today's clips for this user against the daily cap, under one advisory lock.

   It then inserts `job(queued)` and the `estimate` ledger row (the reservation), and enqueues a pg-boss job with a `singletonKey` per job. pg-boss never retries (`retryLimit: 0`).
2. The worker enforces the per-user limit of 2 running jobs and the global limit of 5. The real guard is a re-check of the `jobs` table in one short transaction, because rows survive restarts and pg-boss state does not. It runs these steps:
   1. Move the job `queued` → `submitting`, then call `provider.submit` once, save `provider_job_id` and mark the job `running`. It never re-sends. A crash between submit and saving the id ends as `failed_unknown`, and the estimate stays counted.
   2. The handler stays active until the job is final, so the pg-boss limits cover the time the provider is running.
   3. A reconcile loop (about every 15 s, and at start-up) is the only code that polls `provider.status`. A webhook can replace polling later.
   4. On success, copy the output into MinIO, check with `ffprobe` that it is at least 720p, extract a poster, write the cost rows and mark the job `succeeded`.
3. A job not finished 10 minutes after it starts running is marked `timed_out`. Queue wait does not count.
   - The worker tries to cancel the job at the provider, best effort.
   - fal reports `requestCancellationEnabled: false` for Kling o3 Pro reference-to-video (model page read 2026-10-22). A timed-out job can therefore still finish and be billed. The worker keeps polling quietly, for up to 24 h, so the cost is recorded, but it does not deliver the late result.
4. Retry creates a new job with `retry_of` set. It is allowed only once per original job, and never happens automatically.
5. The UI polls `GET /api/jobs/:id` every few seconds. Pushing updates over SSE is not needed for the MVP.
   - A "My jobs" tray on every page polls `GET /api/jobs?mine` every 5 s. Completion raises a toast and changes the tab title.
   - Results persist when the tab is closed. There is no email, Lark or browser notification.

### Provider adapter

The adapter interface (`packages/core/src/providers/types.ts`) is `submit(input) → providerJobId`, `status({providerJobId, model}) → {state, …}` and `cancel({providerJobId, model})`; the model is passed because fal's queue URLs include the model endpoint. `state` is `queued`, `running`, `succeeded` (with `outputUrl`), `failed` or `canceled` (with `error`); every final state carries `costUsd` and `costSource`, which is `reported` or `estimate`. For fal, `cancel` is a no-op that returns `{supported: false}`. Each model carries its own limits: the allowed ratios, durations, maximum number of images and output resolution (at least 720p), plus a price per second used for the estimate.

## Model picker and pass rate

- Create Videos lists every enabled model with its pass rate and estimated cost. A disabled model is hidden, and the server refuses it.
- Default rule: the model with the higher pass rate is pre-selected. On a tie, the cheaper model is. The app never picks a default in any other way.
- The pass rate is seeded from the bake-off (`docs/BAKEOFF.md`). After that it is `(seed passes + marked passes) / (seed n + marked n)`. Only clips with a Pass or Fail mark count; unmarked clips are left out.
- Enabling a model that has no bake-off record is refused.

## Cost ledger

Every money event is a row in `cost_entries`. The ledger is the only place cost is stored: caps, the Costs page, the Library cards and both CSVs read it, through the `job_costs` view (the sum per job and whether it is final). This is attribution, not billing: there is no wallet, credit or internal price.

**Append-only.** A trigger raises on UPDATE and DELETE. A mistake is corrected only by a new row. All writes go through `packages/core/src/ledger.ts`, which locks the job row and checks its status in the same transaction as the job status change.

**Kinds.**

| Kind | Written when |
|---|---|
| `estimate` | Run is accepted. It is the reservation. |
| `actual_adjustment` | The real cost arrives. It brings the job to the larger of the reported cost and the estimate. |
| `release` | A failure the provider did not bill. It brings the job to 0. |
| `late_bill` | A timed-out job is billed later. |
| `bakeoff` | One row per provider for the canary and bake-off spend. |
| `manual_adjustment` | An Admin adds a correction. A note is required. |
| `invoice_diff` | An Admin enters a provider's monthly invoice total. |
| `store_reassign` | An Admin moves a clip to another store. It is a pair: minus X on the old store, plus X on the new one. |

**Row shape.**
- Exact decimal `usd numeric(12,4)`, never a float.
- ICT `month` and `day`, nullable `user_id`, `team_id`, `store_id` and `job_id`, `provider`, `model`, `is_final`, a nullable unique `ref` and a `note`.
- `bakeoff`, `manual_adjustment` and `invoice_diff` rows have no job, user or team. They appear as a shared "general cost" line and are never allocated.
- A partial unique index on `(job_id, kind)` for the job kinds stops two reconcile loops from booking the same job twice. A shared row's `ref` is unique, so a re-run of the seed or the install script cannot book twice.
- A mock job writes rows of 0 USD, so development data never uses the cap.

**Finality.**
- `is_final = true` means "this row closes the job". A job is final when any of its rows is.
- A job still unresolved 24 h after its timeout gets a final `actual_adjustment` of 0 USD, which keeps its estimate.
- Shared rows are always final.
- The UI labels a job's cost, and a month's total, as provisional until every job is final.

**Month rule.**
- A job's rows carry the ICT month and day of its Run, even when a row (a late bill, for example) is written in the next month. A job created at 23:59 on the last day of a month stays in that month.
- Shared rows carry an explicit month: the invoice's month for `invoice_diff`, and the bake-off's month for `bakeoff`.
- A retry keeps the original job's team and store. Reuse pre-fills the store; the team is always the current team of the person who clicks Run. A team change affects only jobs created afterwards.

**Rounding.**
- USD is stored exactly and summed exactly. Totals show 4 decimals; the CSV keeps 4 decimals.
- VND is computed per row as `round_half_even(usd x the month's rate)` to whole VND, by one SQL function used by the page and both CSVs. Postgres `round()` rounds half away from zero, so it is not used. Every VND total is the sum of the row values, so the detail and the summary match.
- The rate is entered by an Admin per month. Changing one month's rate never changes another month. A month without a rate shows USD only.

**Caps read the ledger.** The monthly cap check sums the ICT month's rows under the advisory lock. The daily clip count includes every job created that ICT day except failed jobs whose total is 0.

**Consistency.** The Costs page and both CSVs are read in one `REPEATABLE READ` transaction. Four totals match to the cent: the CSV detail, the CSV summary, the Costs page total and the cap usage for that month. A test checks this against hand-computed totals that cover every kind.

**How team budgets are added later (cost spec AC 11).**
- `team_id` is already on `users` and on every ledger row, as a snapshot at Run.
- A future team budget is a setting plus a query over `cost_entries` grouped by `team_id` and `month`. No existing row has to be migrated.
- The MVP has no team budget, no warning at 80% and no block at 100%. Only the global caps apply.

## Provider candidates [proposed for Milestone 1]

| Model | Route | List price (2026-10-22) | Clip of 8 s |
|---|---|---|---|
| Kling o3 Pro (reference), 1080p, no audio | fal | $0.112–0.14/s (the range spans fal and Kling direct; B.1 records the fal price) | ~$0.90–1.12 |
| Seedance 2.5 (reference), 720p | Replicate | $0.2312/s | ~$1.85 |
| Not a fallback: Veo 3.1 needs a new decision and budget (see the go/no-go gate) | Vertex / fal | $0.40/s | $3.20 |

The prices come from the session pricing report (audited 53/53 against saved pages) and have not been checked with real API calls. The input limits per model must come from the provider API schema, not from Fash UI labels (RESEARCH-GAPS R3).

## Bake-off judging and go/no-go gate

- The bake-off runs early, as a script, in parallel with Milestone 0. It makes 20 clips (2 models x 10 images, 9:16, 8 s) with one fixed safe preset. Total real spend before go-live stays within $40, counting the canary (one clip per model), the bake-off, any extra round and the server smoke clip, and nothing is retried.
- The 10 images are read-only copies from POD Studio production MinIO. They are kept outside the repository and never go into Git.
- An AI judge scores the clips blind; there is no human reviewer:
  - Clips are anonymised to random ids, scaled to 720p and stripped of metadata.
  - The judge sees only the anonymised folder, 8 sampled frames per clip, the source image and a fixed rubric of the 5 faults.
  - Flicker and judder are measured from all frames, as a luma difference series. The thresholds are fixed in the rubric before judging and are marked provisional.
  - 4 of the 20 clips are judged a second time, and the agreement is reported.
  - `docs/BAKEOFF.md` reports the pass rate per model with a Wilson 95% interval (10 clips per model is a noisy signal), the cost and render time per clip, and the decision. A script recomputes every number in it.
- Go/no-go gate: real-provider and deployment work continues only if at least one model reaches 70%. If neither does, one extra small round runs for the better model with a different preset, within the same $40. If it still misses, the app ships with both models disabled and the result is reported.

## Data terms check (Q6), read 2026-10-22

Q6 requires a provider that does not train on our data and does not keep it long-term. Result of R2: **both candidates pass at the platform layer.** One residual risk is shared by both (see below).

### fal + Kling o3 Pro reference-to-video: PASS

Sources: [API Services terms](https://fal.ai/legal/api-services), [DPA](https://fal.ai/legal/data-processing-addendum) (last updated 2026-07-31), [data retention](https://fal.ai/docs/documentation/model-apis/media-expiration), and the model page.

- **Training:** the API Services terms, section "Use of Client Content", state: "Company will not use Client Content to create, train, develop (directly or indirectly) Company's products or services."
  - This applies to all third-party APIs except models marked "Pending Enterprise Ready". For those excluded models, neither this commitment nor the DPA applies.
  - The model page for this endpoint shows `enterprise_status: "ready"`, so the endpoint is covered.
- **Deidentified data:** the DPA (1.7.2) lets fal process deidentified data to improve its services. This concerns personal data; product images are generally not personal data.
- **Retention:**
  - Request history is not stored when `X-Fal-Store-IO: 0` is sent.
  - CDN file lifetime is set with `X-Fal-Object-Lifecycle-Preference`.
  - The DPA (1.6) deletes personal data after termination, on request.
- **Residual:** the model page shows `is_partner_api: true`, which means "Client Content will be transferred to such a third party", here Kling/Kuaishou. The fal no-training commitment binds fal, not Kuaishou.

### Replicate + Seedance 2.5: PASS (inferred from the licence scope)

Sources: [Terms](https://replicate.com/terms) (last updated 2026-04-01), [data retention](https://replicate.com/docs/topics/predictions/data-retention).

- **Training:**
  - The only licence Replicate takes over Customer Data is for:
    - providing the output;
    - training "Customer Derivative Models", meaning our own fine-tunes;
    - providing the service;
    - compiling "Resultant Data", which is defined as "aggregated and anonymized" usage and performance data.
  - No licence to train other models is granted.
  - There is no explicit "we will not train" sentence. The pass rests on the licence scope.
- **Retention:** for predictions created through the API, "all input parameters, output values, output files, and logs are automatically removed after an hour, by default".
- **Third-party terms:** the Additional Terms section names only Black Forest Labs, Ideogram and Stability. There are no ByteDance/Seedance terms.
  - The live page `replicate.com/bytedance/seedance-2.5` was re-fetched on 2026-10-22 (HTTP 200, 131,294 bytes). The text "licence"/"license", a `license_url` field and any terms or legal link are all absent.
  - The page marks the model `is_official: true`, and its hardware is listed as `CPU`. This suggests Replicate forwards each request to ByteDance's own API instead of running the model itself; this is inferred, not stated on the page.
- **Residual:** if Seedance runs as a "Marketplace Model" hosted by ByteDance/BytePlus, the inputs reach them. Their data terms are not published on Replicate, and Replicate "is not … a party to any separate Third Party Terms".

### Shared residual risk and decision

Neither platform's terms bind the model owner (Kuaishou or ByteDance) in writing that we can see.

- For POD mockups and product photos this is acceptable for the Milestone 1 test (10 images).
- Before images of unreleased designs go to production, the owner decides whether to accept this. If not, the options are:
  - fal ZDR through a sales contract;
  - BytePlus or Kling direct, under their own enterprise terms.

The fal adapter always sends `X-Fal-Store-IO: 0` and an object lifecycle of at least 1 h. The worker copies the output into MinIO immediately, so the record never depends on the fal copy. Replicate deletes outputs after 1 h by default.

## Security and limits

- Provider keys live only in a server-side `.env`, which is gitignored. They are never logged, never sent to the client and never pasted into chat.
- Uploads are checked on the server by size, number of files and image type read from magic bytes.
- Every route checks the session and the role. Deletion checks ownership.
- MinIO is not public. It listens on 127.0.0.1 only, so URLs signed by MinIO itself cannot work.
- Media is served by `GET /api/assets/:id/content`, an authenticated stream that supports `Range` (needed for video seeking).
- Downloads use a download token: `GET /api/assets/:id/download?t=<token>`. The token is an HMAC of the asset id, the user id and an expiry of 5 minutes. The route checks both the token and the session. An expired token, or a token for another user, gets 403.
- The purge sweep is a pg-boss scheduled job. For clips soft-deleted more than 30 days ago it deletes the objects and asset rows and sets `jobs.purged_at`. Job rows and ledger rows are never deleted; they stay as tombstones for the cost ledger. An input asset is purged only when no undeleted job references it.
- The cap check and the job insert run in one transaction, so two concurrent Runs cannot both pass the last slot.
- Shortcut: the cost estimate uses list prices; the actual cost from the provider replaces it when the job finishes (an `actual_adjustment` ledger row). Prices drift, so the per-model price table is reviewed monthly.

## Backups and restore drill

- Nightly: `pg_dump -Fc` plus the MinIO data go into a local encrypted restic repo on the VET server, kept for 14 daily snapshots. Deduplication keeps 14 dailies from multiplying the video size. At most 1 day of data may be lost.
- Weekly: `restic copy` to an encrypted Cloudflare R2 repo, with 8 weekly snapshots. The owner creates the bucket and key. Without them the weekly copy is skipped and the nightly backups still run.
- Before each run the script checks free disk space and refuses below 15%.
- Restore drill (`--drill`): restore the latest snapshot into a scratch database and a scratch MinIO, then compare the user, job and asset counts, plus the `cost_entries` row count and `sum(usd)`. A mismatch exits non-zero.
- The drill runs before staff go live, then monthly from a timer.
- Failures go to the log and to the systemd journal. There are no push alerts.
- The scripts are adapted from the Ideas Hub backup scripts. Before they are used on VET, the reason Ideas Hub gave for keeping its own backup disabled (ADR 0007) is read, and whether it applies here is recorded.

## Not decided here

- Which model wins. That is the outcome of Milestone 1.
- RAM and disk headroom on the VET server (RESEARCH-GAPS R4). The ports are fixed (web 3400, Postgres 5435, MinIO 9400/9401); `install.sh` refuses to run if one is taken.
