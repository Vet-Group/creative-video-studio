# Status — Creative Video Studio (internal)

Last updated: 2026-10-24 (main after #42; see "Overnight 2026-10-24" below). Earlier: 2026-10-23, 11:45 ICT (main after #16). The autonomous run is under way under the plan v5.1 pre-approval; the current state is in "Run state" below. Earlier sections keep the research record. The deep-interview decisions are recorded in the section after Q9; where they differ from Q1–Q9, they win.

## Workspace

- Product workspace: `C:\Users\User\dev\work\creative-video-studio`.
- Git: private GitHub repository `anhtahaylove/creative-video-studio` (created in R.1), protected `main`, CI on every PR. Run worktrees: `C:\Users\User\dev\wt\cvs-app` (app steps) and `C:\Users\User\dev\wt\cvs-bakeoff` (bake-off steps).
- Read-only reference: `C:\Users\User\dev\work\fash-internal`. Nothing in that folder is moved, edited or turned into product code.
- The product UI and code will be written from scratch. Fash HTML, CSS, JS, fonts, logos and images do not go into this repository; they serve as a workflow and layout reference only.

## Sources read for this status

1. `README.md` and the local handoff notes (this workspace).
2. `fash-internal/README.md`, `GRILLING-BRIEF.md`, `REVERSE-ENGINEERING.md`.
3. `fash-internal/public/manifest.json` (finalized 2026-10-22T08:52Z):
   - 10 pages, all captured with status 200.
   - 1,076 assets, one per URL. Their `bytes` fields sum to 225,266,596 bytes (214.8 MiB).
   - `totalDownloadedBytes` is 250,455,451 (238.9 MiB). It is a running total kept across capture runs (`tools/capture.mjs` lines 24 and 61), so it is not the size of the current reference.
   - 2 failures, both HTTP 404: the same Font Awesome brand font in woff2 and ttf.
4. `fash-internal/evidence/verification.json` (verified 2026-10-22T08:54Z, after finalize):
   - 10/10 results have status 200 and `titleMatches: true`.
   - `brokenImages` and `externalResources` are empty on every page.
   - `scriptSources` is `/local-ui.js` only. This lists the page's script sources; it is not an execution trace.
   - `mutationEndpointStatus: 405` comes from `POST /upload-image`. `tools/serve.mjs` answers 405 to any method other than GET/HEAD, so this proves the server is read-only, not anything about uploads specifically.
   - Stated limitations: "no AI/backend equivalence claim" and "Videos are static posters".
   - The REA figures below (11 scripts, 163,699 bytes, 46 findings) appear in `evidence/findings.json`, not in these two files. The ARE count of 12,866 entries comes from `REVERSE-ENGINEERING.md` only.
5. An earlier read-only capture of the logged-in dashboard (no Run buttons were pressed): a model catalog and an API pricing report, kept in temporary local storage only.

## Locked scope (not to be re-asked)

- **In scope:** an internal video creation web app for company staff, built and run independently of Fash.
  - A small dashboard.
  - A Create Videos screen.
  - The flow input/prompt → supported settings → submit job → track status → play → download → history/library.
  - Internal auth and permissions, storage, and a provider budget sized for one company.
- **Out of scope (phase 1):**
  - Marketing landing pages, pricing, subscriptions, billing, checkout and credit sales.
  - Image generation, Try-On, background removal, upscaling, image editing and the Apps catalog. **Superseded on 2026-10-23:** the owner widened the scope to the whole dashboard (Try On, Image Generation, Marketing Studio, Apps); pricing and billing stay out. See "Overnight 2026-10-24".
  - Building all 10 captured pages.
- **Allowed:** reference, product or first/last-frame images as video inputs. This does not make an image module.
- **Decided in grilling, Q1 (2026-10-22):** the MVP flow is product video from existing images. Real inputs are POD mockups and product photos. Prompt-only video is out as a separate goal. UGC (a talking person or voice-over) is deferred to a later phase.
- **Decided in grilling, Q2 (2026-10-22):** output clip spec.
  - Aspect ratio 9:16 or 1:1 (no 16:9 yet).
  - 5–10 s, default 8 s.
  - At least 720p.
  - No audio.
  - 1 variant per Run.
- **Decided in grilling, Q3 (2026-10-22):** quality bar.
  - A clip is rejected if any one of these holds:
    1. The print, text or logo is warped or changed.
    2. The product colour is clearly off from the source image.
    3. The product is deformed or gains extra details.
    4. There is flicker or judder.
    5. Stray text or a watermark appears.
  - Sample set: 10 company inputs (5 POD mockups, 5 product photos). They cover the main product types, and at least 2 have small text.
  - A model qualifies if at least 70% of its clips pass on the first try, judged blind by an AI judge (see the deep-interview decisions).
- **Decided in grilling, Q4 (2026-10-22):** users and access.
  - Two roles:
    - **Member:** creates videos, views and downloads every video in the shared library, deletes only their own.
    - **Admin:** manages users, sets cost limits, can delete any video.
  - Superseded by the deep-interview decisions: teams and stores exist for cost attribution only. There are no budgets and no Lark department sync.
  - Login is Lark OAuth. Fallback: email and password accounts that an Admin creates. An Admin may create a user without a password; that user signs in only with Lark.
  - Not yet checked: whether the company Lark tenant allows creating an OAuth app.
- **Decided in grilling, Q5 (2026-10-22): the proposal was accepted as default settings.** Admin can change every number below. None has been measured yet; they are starting values.
  - Limits (no credits):
    - Company cap: $200/month, counted in USD of real provider cost.
    - Each Member: 5 clips/day, counted in clips (retries included). This was 20 until Q5b.
    - At a cap, Run is blocked with a message. Jobs never retry automatically.
  - Concurrency: at most 2 running jobs per user and 5 for the whole app. Extra jobs wait in a queue.
  - A job still unfinished 10 minutes after it starts running is marked failed (status `timed_out`; queue wait not counted, as clarified when writing ARCHITECTURE). The user may retry it manually once; the retry counts toward the caps.
  - Design volume: 5–7 clips/day for the first month. This was 20–50 until Q5b.
  - **Q5b (2026-10-22):**
    - The $200 cap is kept for month 1 as a pilot.
    - At list price, 5–7 clips/day costs about $135–235 a month with Kling ($0.90–1.12 per clip; above about 6 clips/day at the high price it passes $200) but about $277–389 with Seedance ($1.85 per clip). With Seedance, the cap allows only about 3–4 clips/day.
    - After Milestone 1 and one month of real invoices, the Admin resets the caps from the real accept rate.
  - Estimated cost per accepted clip: about $1.3–2.6 (list price ÷ 70%). This has not been checked against a real invoice.
- **Decided in grilling, Q6 (2026-10-22):** privacy and retention.
  - Only providers whose API terms say inputs are not used for training and are not kept long-term. The terms were read on 2026-10-22: fal and Replicate pass at the platform layer, with a shared model-owner residual risk (`ARCHITECTURE.md`, "Data terms check").
  - Input images and output videos are stored in company-controlled storage. Provider temporary links are never the record.
  - Both are kept until someone deletes them, then soft-deleted for 30 days, then purged.
  - Photos with models are accepted. The upload screen reminds users to upload only images the company has the right to use.
- **Decided in grilling, Q7 (2026-10-22):** hand-off and library.
  - Users download finished videos as MP4.
  - Each card in the shared library has:
    - inline playback;
    - creator, time, model, aspect ratio, duration and real cost;
    - a **Reuse** button that opens Create Videos with the same images, prompt and settings.
  - Filters: creator, date, aspect ratio.
  - Deferred: sending to Lark, Google Drive, posting to Etsy/TikTok, multi-step approval, favorites.
- **Decided in grilling, Q8 (2026-10-22):** stack, hosting, maintainer.
  - Reuse the Ideas Hub stack in this separate repo:
    - a Next.js web app and a worker that calls providers;
    - Postgres with Drizzle, the pg-boss queue, MinIO (S3 API) and better-auth;
    - Postgres and MinIO run with docker-compose; web and worker run as systemd units (plan step D.4).
  - Providers sit behind an adapter layer: a mock adapter for tests, plus real adapters for fal and Replicate; only models that pass the bake-off are enabled.
  - The app runs on the company VET Linux server, with its own Postgres and MinIO (no shared database with Ideas Hub or POD Studio).
  - Deploying needs owner approval because the server is production. The plan collects it once, as the pre-approval sentence (section 3).
  - Maintainer: the owner, under the usual repo workflow.
  - Not yet checked:
    - free RAM, disk and ports on the VET server;
    - whether better-auth's generic OAuth works with Lark.
- **Decided in grilling, Q9 (2026-10-22):** proof milestones.
  - **Milestone 0 (no cost)** is a local end-to-end slice with a mock adapter. The flow is: email login → upload → choose ratio and duration → Run → pg-boss job → live status → play → download MP4 → library → Reuse.
    - Tests cover the flow, the caps and the timeout.
    - The mock output is a sample file and is labelled as mock in both the app and the reports.
  - **Milestone 1 (paid)** is a bake-off on the 10-image sample set.
    - Candidates: Kling o3 Pro via fal (resolution not stated by fal; measured at B.5a) (about $0.90–1.12 per 8 s clip) and Seedance 2.5 720p via Replicate (about $1.85).
    - 20 clips, about $27.5–29.7 at list price. A hard stop at $40 covered the canary, the bake-off, any extra round and the server smoke clip; on 2026-10-24 the owner lowered it to $20 (`CAP_USD`), which fits the canary, the 20 clips at 5 s and the smoke clip (about $19.30), so an extra round needs the owner to raise it. Nothing is retried; every job is logged to `jobs.jsonl`.
    - Before the run, the provider data terms are checked (Q6) and any failing candidate is replaced.
    - The owner creates and funds the provider accounts; keys never go into chat.
  - Continue if at least one model reaches 70% under the Q3 rubric. Then list every passing model in the picker (the higher pass rate is pre-selected) and build the real adapters. Deployment to VET is covered by the owner's pre-approval in the plan (section 3).
  - If neither reaches 70%: replaced by the go/no-go gate below (one extra round with a different preset, then both models disabled). Veo 3.1 or prompt changes need a new decision.

## Deep-interview decisions (2026-10-22 and 2026-10-23)

These come from the plan (`.omc/plans/creative-video-studio-plan.md`) and its specs. They add to or override Q1–Q9.

- **Model picker.**
  - Staff choose the model. Kling o3 Pro (fal) and Seedance 2.5 (Replicate) are each listed with a pass rate and an estimated cost.
  - Default rule: the model with the higher pass rate is pre-selected; on a tie, the cheaper one. No other default rule is used.
  - The first pass rate comes from the bake-off. After that it is `(seed passes + marked passes) / (seed n + marked n)`, counting marked clips only, including clips deleted or purged after they were marked.
  - An Admin enables or disables each model. A new model needs a small bake-off on the same 10 images first.
- **Accounts.** An Admin may create a user without a password; that user signs in only with Lark. Only emails an Admin has added can sign in with Lark, and go-live does not wait for Lark.
- **AI judge.**
  - The bake-off is automatic: a fixed script copies 10 images read-only from POD Studio production (5 mockups, 5 product photos, at least 2 with small text; kept outside Git), and an AI judge scores the 20 clips blind. There is no human reviewer.
  - The judge sees anonymised clips, sampled frames and a fixed rubric. Flicker and judder are also measured from frame differences, with thresholds fixed before judging.
- **Pass/Fail verdict, report and audit log.**
  - The creator or an Admin marks each clip Pass or Fail. Fail needs one of the 5 faults or "Other".
  - The Admin Report shows 3 weekly KPIs per user (accepted clips, cost per accepted clip, median time from Run to clip) and the failure rate, with a CSV export.
  - An audit log records who changed caps, models, presets, roles, bans and teams, who deleted another user's clip, and who edited a verdict.
- **Presets.** 6 POD presets are written in advance, with Vietnamese labels and English prompts. An Admin edits and toggles them. The bake-off uses one fixed safe preset.
- **Tray.** A "My jobs" tray on every page shows live status, with a toast and a tab-title change on completion. It shows "worker offline" after 60 s without a worker heartbeat.
- **Backups and restore drill.** Nightly `pg_dump` plus a MinIO copy, kept 14 days on VET. A weekly encrypted copy goes to Cloudflare R2. A restore drill runs before staff go live and then monthly.
- **Go/no-go gate.** The bake-off runs early, in parallel with Milestone 0. Real-provider and deployment work continues only if a model reaches 70%. If neither does, one extra round runs for the better model if it fits under the $20 stop (or the owner raises it); if it still misses, the app ships with both models disabled and the result is reported.
- **Teams, stores and the cost ledger.** This replaces the "No departments or brands" line in Q4.
  - Teams and stores are managed by an Admin. Each user is in one team. A store code equals POD Studio's `store_id`.
  - Every provider dollar is an append-only ledger row with user, team (at Run), store, provider, model and ICT month.
  - Caps, the Costs page and two CSVs read the ledger. This is attribution, not billing: no team budgets, wallet or team-lead role.
  - Details: `docs/ARCHITECTURE.md`, "Cost ledger".
- **Autonomous run.** The owner acts once, before the run: a zero-cost preflight (`pnpm preflight`) and one pre-approval sentence (`pnpm run:approve`), valid 14 days. It covers the private repository, up to $40 of real spend before go-live, read-only VET access for the sample images and checks, the deployment, the tunnel and DNS record, and Lark messages to the owner only. Five hard stops are enforced in code (plan section 3).
- **Provider data.** The fal adapter sends `X-Fal-Store-IO: 0` and an object lifecycle of at least 1 h; the worker copies the output at once. Downloads use an HMAC download token instead of presigned URLs.

## What exists

### Historical reference results (earlier capture run, fash-internal; not checks of the new app)

- A local frontend reference of 10 pages. It has no backend, no real upload, no queue and no persistent library. Its pages load only `local-ui.js`, not the Fash JavaScript.
- REA 6.7.0 analysed 11 scripts (163,699 bytes, 46 findings, 0 parse failures). These came from Try-On plus shared code. **The video-specific JavaScript has not been analysed.**
- Create Videos controls recorded: `vid-prompt`, `vid-audio`, a search box. The Library was observed empty. `GET /dashboard/gallery-cursor` returned 200, but its schema is unknown.
- SignalR-style literals (`/hubs/apps`, `JoinRun`, `StatusUpdate`, `GenerationFinished`, `GenerationFailed`) were found statically only. They have no runtime proof and are not a backend contract.
- ARE (12,866 entries) has no Fash client or clone. No further ARE search is planned.

### Label-level video observations from this session's earlier capture

These are UI labels only. They are not validated constraints.

- Video model menu, as max resolution and duration labels:
  - Seedance 2.5 / 2.5 Reference: 1080p, 4–30s.
  - Seedance 2.0 / 2.0 Reference: 1080p, 4–15s.
  - Kling o3 Pro Reference / Kling 3.0 Pro: 1080p, 3–15s.
  - Gemini Omni Flash (+ Reference): 720p, 3–10s.
  - Veo 3.1: 1080p, 8s.
  - FLUX 3, Grok Imagine, WAN 2.7 and Minimax variants.
- 19 "Steal our prompts" presets:
  - All 9:16 with audio off.
  - Models: Seedance 2.5 Reference at 480p, or Kling o3 Pro Reference.
  - Durations 6–10s.
  - Up to 7–9 reference images depending on the model.
  - Run costs 111–302 Fash credits.
- 27 example video prompts were captured as text.

### Provider pricing research from this session

These are candidates only; nothing is approved.

- Per-second list prices read on 2026-10-22:
  - Seedance 2.5 480p: about $0.10/s via BytePlus or Replicate.
  - Kling o3 Pro: $0.112–0.14/s via fal or Kling.
  - Veo 3.1: $0.40/s.
  - Omni Flash 720p: about $0.10/s via Google.
- These figures were audited against the saved pages (53/53). They have not been tested with real API calls, so latency, failure rate and output quality are unknown.
- BytePlus ModelArk sells to Vietnam. Seedance must be called through the Johor region.

### New app — run state (2026-10-23, 11:45 ICT)

Kept apart on purpose: merged code is not a deployment, and a mock job is not a provider result.

- **Code merged to `main`** (CI green on `218f1b7`, `96385cc`, `18f0213`):
  - #1 run harness, server gate, CI, doc alignment; #2 results-report dependencies;
  - #4, #5 shared contracts, presets, per-worktree ports (A.0b);
  - #6 assets and MinIO storage (M.1); #8, #9 jobs, ledger, presets and the worker on the **mock** provider (M.2);
  - #10 daily and monthly caps, one manual retry (M.3); #11 Create, Library, login, job tray, verdicts, delete, purge (M.4);
  - #15 Admin area (M.5); #7 nightly backup, weekly R2 copy, restore drill (D.2); #13 deploy kit with dry-run (D.4);
  - #12, #14 preflight fixes and Google login in the harness.
  - #16 Google and Lark sign-in with account linking, the sign-in methods page, Admin unlink and the public `/privacy` page (D.1, mocked OAuth; the live sign-ins are D.5).
- **Tests:** unit, integration and e2e suites run in CI on each PR; the e2e suites use the mock provider only. Library playback and download are covered by `apps/web/e2e/flow.e2e.test.ts` and `mobile.e2e.test.ts`.
- **Deployment:** see "Live on VET" below (2026-10-25). This line described 2026-10-23.
- **Paid bake-off:** done 2026-10-24, result in [`BAKEOFF.md`](BAKEOFF.md). Go: Kling o3 Pro passed 7/10 (70%); Seedance 2.5 reached 6/9 (67%) and stays disabled. Billed $14.85 (fal $5.60, Replicate $9.25 for the 8 clips that rendered); the spend stop counts $18.32 because it keeps failed jobs at their estimate, including two Seedance jobs an off-script check created by mistake (one canceled, one refused, neither billed). Replicate is prepaid credit, not monthly billing. Findings for M.6 and D.5:
  - Replicate drops a create request whose JSON body is about 3.8 MB (a 2.9 MB PNG inlined as a data URL); 3.7 MB passed. The worker inlines uploads of up to 10 MB, so large images need downscaling or the Replicate files API before Seedance is ever enabled.
  - Replicate refused one product image as sensitive (E005), a render failure that costs a user a job.
  - From the office PC, downloads from `replicate.delivery` failed for about 25 minutes per clip while the render took 134–159 s; the worker's 10-minute run timeout would time such a clip out. The D.5 smoke checks this from the VET server.
- **Owner keys:** preflight 12/12 ready on 2026-10-23 (fal, Replicate, Lark, Google, Cloudflare, R2, restic, first Admin).
- **Change request UI-PARITY (2026-10-23):** the app should look and move close to the Fash video screens. Matrix and acceptance in [`UI-MOTION-PARITY.md`](UI-MOTION-PARITY.md); built in run step M.7 after D.1, before the deploy. M.7 is built in the `cvs/app-m7` PR: C1-C3 hold (Examples clips play from local fixtures, fallbacks, Create and Library at 1440, 1280, 1024, 1023 and 390 px); C4 pending: the owner compares the baselines with the Fash audit screenshots. UI and motion parity not met until then. The Playwright e2e is verified locally only, because CI does not run Playwright. It uses local fixtures and does not wait for the bake-off, funding or the port 4317 reference. Cosmetic rows deferred: Library cards have no separate status chip (the Library lists finished clips only), the preset banner shows the poster rather than a loop, and the carousel is used in the preset picker only. If the deploy goes ahead with M.7 skipped or incomplete, this page will say "UI and motion parity not met".
- **M.7b (2026-10-23):** M.7 merged as #23 and was skipped with C4 not met; the owner judged the look not close enough. M.7b applies the measured fix list in [`UI-MOTION-PARITY-M7B.md`](UI-MOTION-PARITY-M7B.md) (shell, Create card, upload, controls, tabs, Examples grid, Run button, narrow layout) before the deploy. M.7b gates D.5: only `done` releases the deploy, and it is recorded done only when the owner accepts C4 on the new revision. UI and motion parity stays "not met" until then.

### Overnight 2026-10-24 (whole-dashboard scope)

The owner widened the scope on 2026-10-23 from video only to the whole dashboard: Explore, Try On, Image Generation, Create Videos, Marketing Studio, Apps and Library. Pricing, subscriptions, credits and billing stay out of scope; real USD cost is shown instead. The deploy waits until the whole dashboard is built. Providers are allowed, with caps.

- **Merged to `main`** (each one has CI green on its exact head commit, and its full Playwright e2e was run locally, since CI does not run Playwright):

  | PR | Content |
  |---|---|
  | #32 | V01 live measurements |
  | #33 | Image and apps budget, separate from video: per-feature caps, migration 0006, [`PROVIDERS-AND-CAPS.md`](PROVIDERS-AND-CAPS.md) |
  | #34 | App shell: sidebar in the live order, icon rail, Settings dialog without Billing, Explore |
  | #35 | About tab on Create Videos |
  | #36 | Image jobs core: `ImageProvider`, image models seeded disabled (0007), the jobs API for image features, Library kinds |
  | #37 | Library favourites (0008), oldest-first sort, card size slider, empty state |
  | #38 | Seven image app models seeded disabled (0009) and their fal request builders. Topaz Upscale is priced at a flat $0.08 per output up to 24 MP, and inputs it cannot take release their estimate |
  | #39 | Try On and Image Generation pages, plus `/api/image-models` |
  | #40 | Marketing Studio core: `marketing` on Kling O3 Pro (0010), the jobs API rules, the prompt builder, and `[ImageN]` rewritten to `@ImageN` for Kling |
  | #41 | Apps index and app pages |
  | #42 | Marketing Studio page |

- **Live provider check (2026-10-24):** one real fal call was made per seeded image model, through the adapter, with synthetic inputs. 11 of 12 succeeded (all Image Generation and Try On models, plus Model Swap, Background Changer, Reframe, Upscale and Background Remover). Easel Face Swap answered HTTP 503 "Application is not available" on fal for both field shapes; it stays disabled. The check spent about $0.84. The video models (Kling for Marketing Studio) were not called; they wait for M.6.
- **Not done:**
  - Every image model and app ships disabled; an Admin enables each one in Settings.
  - Model configuration for video (M.6), the Motion Control and Media Optimizer apps (shown as "coming soon"), and the Marketing formats other than UGC Try On are not built.
- **Deployment:** none on 2026-10-24. M.7b waits on the owner's C4 comparison, which now covers the whole dashboard; D.5 follows it.

### Live on VET (2026-10-25)

- **Deployed:** https://video.vetgroup.net runs main `609d4b9` (the Hermes A.2 fixes, #64) in `/opt/creative-video-studio` as root user units (`cvs-web` on port 3400, `cvs-worker`, `cvs-tunnel`, and the backup, weekly R2 copy and monthly drill timers), with the compose project `creative-video-studio` (Postgres, MinIO). Tunnel `creative-video-studio`, new CNAME `video.vetgroup.net`. Deployed through the run's gate key under the owner's pre-approval; `bash scripts/run/vet.sh status` shows the state.
- **Fixed on the way (PRs #56-#61):** the deploy key name and the first Admin from `.env` (#56), `cloudflared` in `/root/.local/bin` (#57), the zone lookup that always failed (#58), `cvs-backup` reading `backup.env` outside systemd (#59), an update now restarts web and worker, plus the gate's `status` script (#60), and the Lark scope (#61). After the run's gate key was removed at A.2, updates go through the owner's `vet-linux` access.
- **Smoke (real money):** the first Admin signed in through the hostname, uploaded a product image and ran one Kling o3 Pro job: it succeeded in 147 s; the clip downloaded (h264 1080x1920, 5.04 s), played with ranged requests, appeared in the Library, and Costs showed $0.56.
- **Sign-in:** Google and Lark were checked live in a browser. Lark needed two fixes: the redirect URL is `https://video.vetgroup.net/api/auth/callback/lark` (better-auth's core callback route), and the scope is `contact:user.employee:readonly`, the one Lark Suite documents for `enterprise_email` in `user_info`; `contact:user.enterprise_email:readonly` does not exist there.
- **Backups:** a backup and a restore drill ran through the gate: backup done (pruned), drill of snapshot `06a03dee` ok (objects and the users, jobs, assets and cost_entries tables present).
- **Neighbours:** Ideas Hub units and the POD Studio containers were sampled every 30 s during each deploy; every sample was OK (11 units active, none failed, `ideas.vetgroup.net` answering).
- **Seedance on this network:** from the VET server, as from the office PC, TLS to `replicate.delivery` times out (TCP connects, no handshake, 3 of 3 tries), while `api.replicate.com` and `fal.media` work. Seedance clips could not be downloaded here, so Seedance stays disabled for network reasons too, not only its 67% pass rate.
- **Ledger:** bake-off billed $14.85; the smoke clip $0.56; the image-model check $1.09 (fal Usage page).

## Evidence gaps

### A. Designable independently (no Fash behaviour needed)

The Fash backend contract is not needed: the new app calls its own providers.

- Job lifecycle: queue, status, timeout, retry, cancel, recovery after reload. This depends on provider APIs, typically a webhook or polling flow.
- Data model for inputs, jobs, outputs and the library, with permissions and retention.
- Per-model input and setting constraints. **The authoritative source is the provider's API docs, not Fash labels.**
- Error, empty, loading and success states, download and reuse-settings, the daily and monthly caps (no team budgets).
- Quality rubric and a test input set from company assets.

### B. Needs Fash behaviour verification (browser checks)

UI and motion parity is no longer optional: see `UI-MOTION-PARITY.md` (M.7). The two checks below stay optional refinements.

These would only refine the UX reference. Each one is recorded in `docs/RESEARCH-GAPS.md` once grilling shows it matters.

- Which settings change when the model changes on Create Videos (field visibility, limits, when Run becomes enabled). No job submission needed.
- Shape of the in-progress and finished states, and of a populated Library video card (playback, download, reuse). This needs one paid job and is **only with an agreed credit budget**.

### C. Provider facts that need provider docs or a paid test

- Real latency, failure rate and output quality per candidate model on company inputs. This needs paid jobs with an agreed provider, job count and maximum budget.

## Pending decisions (grilling order)

1. ~~First video type and the real input assets.~~ Decided: see Q1 above.
2. ~~Duration, aspect ratio, resolution, audio/voice, variants per run.~~ Decided: see Q2 above.
3. ~~Quality bar and sample set.~~ Decided: see Q3 above.
4. ~~Users, teams and permissions (view/download/delete), SSO.~~ Decided: see Q4 above.
5. ~~Volume per day, concurrent jobs, budget per accepted video, acceptable wait.~~ Decided: see Q5 above.
6. ~~Privacy: which providers may receive company assets; retention and deletion.~~ Decided: see Q6 above.
7. ~~Hand-off of finished videos (download only, or a shared folder/integration).~~ Decided: see Q7 above.
8. ~~Who maintains, deploys and supports the app; stack choice.~~ Decided: see Q8 above.
9. ~~The first proof milestone and its stop/continue criteria.~~ Decided: see Q9 above.

## Memory/record conflicts

An earlier note (2026-10-22) describes:

- an app covering image, try-on, video, UGC and a credit system;
- an image-heavy MVP;
- the reference capture in `fash-internal`.

The handoff of 2026-10-22 supersedes it: video only, no credits or billing, and `fash-internal` is read-only. The provider routing in that note is kept as candidate input only.

## Next step

Current: the run continues on its own (conductor, watchdog every 20 minutes). The owner's remaining manual part is one Lark and one Google browser sign-in at D.5. The text below is the pre-run record.


Q1–Q9 are decided. The owner accepted three extra defaults on 2026-10-22:
- 1–4 images per Run, with the first image as the main product; an optional prompt plus company-written presets;
- a Vietnamese UI;
- desktop first, with view and download only on mobile.

The documents are aligned with the delivery plan (consensus v5). The owner now fills `.env` from the preflight checklist, runs `pnpm preflight` and types the pre-approval sentence with `pnpm run:approve`. The run then creates the repository and works through the plan's phases without further approval waits.
