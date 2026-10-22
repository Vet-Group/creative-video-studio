# PRD — Creative Video Studio (MVP)

Status: draft for owner approval, 2026-10-22; aligned with the deep-interview decisions on 2026-10-23. Source of decisions: `docs/STATUS.md` (grilling Q1–Q9 and the deep-interview section). Where this PRD and the plan differ, the plan wins.

## Goal

Company staff turn existing product images into short product videos without leaving one internal tool. Provider cost stays visible and capped. The app runs on the company VET Linux server and is reached at `video.vetgroup.net` (LAN only until the Cloudflare tunnel exists).

## Persona

- **Member:** a staff member who makes listing and social videos from POD mockups and product photos. Desktop browser, Vietnamese UI.
- **Admin:** the owner or a lead who manages users, teams, stores and cost caps, and reads the reports. The boss uses an Admin account; there is no separate report-viewer role.

## Main flow

1. Sign in with Lark, or with an email account an Admin created.
   - Only emails an Admin has added can sign in with Lark. The first Lark login links to the existing user with the same email.
   - An Admin may create a user without a password. That user signs in only with Lark. A password is needed only for the email fallback.
   - Go-live does not wait for Lark: email login comes first.
2. Create Videos:
   - Upload 1–4 images. The first image is the main product.
   - Optional prompt, or pick one of the 6 company-written presets. An Admin can edit and toggle the presets.
   - Settings: aspect ratio 9:16 or 1:1, duration 5–10 s (default 8 s), model. Output is at least 720p. No audio. 1 variant per Run.
   - Model picker:
     - Staff choose the model. Each enabled model is listed with its pass rate and estimated cost.
     - Default rule: the model with the higher pass rate is pre-selected. On a tie, the cheaper model is.
     - The first pass rate comes from the bake-off. After that it updates from the Pass/Fail marks made in the app.
     - An Admin enables or disables each model. A new model needs a small bake-off on the same 10 images before it is listed.
   - An optional store picker (a store or brand the clip is for) lists only visible stores.
   - The screen shows an estimated cost before Run.
3. Run puts a job in the queue. The screen shows its live status: queued → running → succeeded / failed / timed out.
   - The user is free after Run. A "My jobs" tray on every page shows live status. Completion raises an in-app toast and changes the tab title.
   - Results persist when the tab is closed. There is no email, Lark or browser notification.
   - The tray shows "worker offline" when the worker has sent no heartbeat for 60 s.
4. Finished:
   - inline playback;
   - Download MP4;
   - Reuse, which opens Create Videos prefilled with the same images, prompt, settings and store;
   - Pass or Fail verdict: the creator or an Admin marks the clip. Fail needs one of the 5 faults below, or "Other". Unmarked clips are left out of the pass rates.
5. Library: every video from every user, newest first, filtered by creator, date and aspect ratio.

## In scope

- The screens: Sign-in, Create Videos (with the job status panel and the "My jobs" tray), Library, Admin.
- The Admin area has Users, Teams, Stores, Settings, Presets, Report, Costs and an audit log:
  - **Users:** add a user (a team is required; the password is optional), ban and unban, set a temporary password, change role, change team. A team change affects only jobs created afterwards.
  - **Settings:** the two caps, and enabling or disabling each model.
  - **Presets:** edit the label and the prompt text, and enable or disable each preset.
  - **Report:** the 3 weekly KPIs per user (accepted clips, provider cost per accepted clip, median time from Run to clip), the job failure rate and spend against the cap, with a CSV export.
  - **Audit log:** records who changed caps, models or presets; who banned a user or changed a role or a team; who deleted another user's clip; who edited a Pass/Fail verdict; and the team, store, rate and invoice changes below. Each entry stores who, when, what, and the old and new values.
- Teams, stores and the cost ledger (attribution only; this replaces the old "departments and brands" non-goal):
  - An Admin creates teams (a name and an optional cost-centre code). Each user belongs to exactly one team. A default team is seeded, and the users that already exist move into it. Teams are hidden, never deleted.
  - An Admin creates stores (a name and a unique code that equals POD Studio's `store_id`). The code cannot change once the store has cost. Stores are hidden, never deleted. Stores are typed in by hand; there is no sync with POD Studio.
  - Every provider dollar goes into an append-only cost ledger, with the user, the team at the moment of Run, the optional store, the provider, the model and the month. Caps, reports and CSVs read the ledger. See `docs/ARCHITECTURE.md`, "Cost ledger".
  - The Costs page shows each ICT month by user, team and store, in USD and in VND at a monthly rate the Admin enters. Failed clips are shown in a separate column. Bake-off, manual adjustments and invoice differences form a shared "general cost" line that is not allocated.
  - The Admin enters each provider's monthly invoice total. The app books the difference and turns it red above 5%.
  - Two CSVs per month (the ledger detail, and a summary by team × store). The CSV totals, the Costs page total and the cap usage match to the cent.
  - A Member sees the cost of each clip on the Library cards and their own month-to-date total, and no other aggregate. Only an Admin can change a clip's store.
- Uploads: JPEG, PNG or WebP, at most 4 images and at most 10 MB each. The limits are checked on the server.
- Caps:
  - company $200 per month, counted in USD of real provider cost;
  - 5 clips per Member per day, retries included. A failed job that the provider did not bill gives the slot back.
  - A running job reserves its estimated cost, so concurrent Runs cannot overshoot the monthly cap.
  - Both caps are Admin settings, reviewed after the first month.
  - Day and month are counted in Asia/Ho_Chi_Minh time.
  - At a cap, Run is blocked and the screen says why. A Member sees only that the company's monthly budget is used up; the remaining budget is shown to Admins only.
- Concurrency: at most 2 running jobs per user and 5 for the whole app; the rest wait in the queue.
- A job still running after 10 minutes is marked timed out. The user can retry it manually once, and never automatically. Retries count toward the caps.
- Delete rules:
  - A Member deletes their own videos; an Admin deletes any video.
  - Deleted videos are soft-deleted for 30 days, then purged together with their input images. An input image that another live video still uses (through Reuse) is kept.
- Each video card shows the creator, the time, the model, the aspect ratio, the duration and the real cost.
- The upload screen reminds users to upload only images the company has the right to use.
- Backups and the restore drill:
  - Every night, `pg_dump` plus a MinIO copy, kept 14 days on the VET server. At most 1 day of data may be lost.
  - Every week, an encrypted off-host copy to Cloudflare R2. The owner creates the bucket and key.
  - A restore drill restores the latest backup into a scratch database and a scratch MinIO and compares counts. It runs before staff go live, then monthly.
  - There are no push alerts. The failure rate shows on the Report page; backup failures go to the log.

## Out of scope (MVP)

- Pricing, credits, billing, landing pages.
- Image generation, Try-On, image tools, Apps.
- UGC, voice and audio.
- Prompt-only video as a separate mode. It still works when no image is attached, but it is not tuned.
- Lark, Drive, Etsy or TikTok delivery.
- Approvals and favorites.
- Team or per-user money budgets (warnings or blocks), a wallet, credits, an internal price, a team-lead role, Lark department sync, POD Studio store sync, month locking and `.xlsx` export. The data model allows team budgets later.
- Push alerts by Lark or email, and automatic model fallback when a provider fails.
- Mobile-optimised creation. On a phone, users can only view and download.

## States each screen must handle

- **Create:** empty, uploading, invalid file, over the cap, submitting, provider error.
- **Job:** queued, running, succeeded, failed (with the provider message), timed out, retried.
- **Library:** empty, loading, list, filtered to nothing, deleted item.

## Acceptance criteria

This is a summary. The plan tracks the full list: 33 base, 18 cost and 20 autonomous-run criteria, each with machine-checked evidence.

Milestone 0 runs on the mock provider.

1. A Member can sign in by email, upload 1–4 images, choose 9:16 or 1:1 and 5–10 s, Run, watch the status change, play the result, download the MP4, find it in the Library and Reuse it with every field prefilled.
2. Uploads that break a rule are rejected on the server: a 5th image, a file over 10 MB, a non-image file.
3. A Run beyond either cap is refused on the server, and nothing is sent to the provider.
4. A 3rd concurrent job from one user waits in the queue rather than starting.
5. A job past 10 minutes ends as timed out. One manual retry is allowed and a second is refused.
6. A Member cannot delete another Member's video. Soft-deleted items disappear from the Library and are purged after 30 days.
7. Mock output is labelled "MOCK" in the UI and in the job record.

Milestone 1 is a paid quality gate:

8. On the 10-image sample set, a model passes if at least 70% of its clips have none of the 5 rejection faults:
   1. warped or changed print, text or logo;
   2. off colour;
   3. a deformed product or extra details;
   4. flicker or judder;
   5. stray text or a watermark.

   The faults are judged blind by an AI judge; no human reviewer is needed.
   - Clips are anonymised to random ids and scaled to 720p. The judge sees only those clips, sampled frames, the source image and a fixed rubric.
   - Flicker and judder are also measured from the difference between consecutive frames. The thresholds are fixed before judging.
   - The scores are recorded per clip, with the evidence frames, the cost and the render time of each clip. A second judging of 4 clips reports the agreement.
   - Pass rates are reported with a Wilson 95% interval. They only seed the picker; in-app Pass/Fail marks update them.

   Go/no-go gate: the work on real providers and deployment continues if at least one model reaches 70%. If neither does, one extra small round runs for the better model with a different preset, within the same $40. If it still misses, the app ships with both models disabled and the result is reported. This is not a stop.

Operations and cost criteria:

9. An Admin creates a user without a password. Email sign-in for that user is refused; Lark sign-in works once the Lark app exists. A banned user cannot sign in.
10. The creator or an Admin marks a clip Pass or Fail. Fail without a fault is refused, another Member gets 403, and every edit is audit-logged.
11. Every accepted Run writes a cost-ledger row. For each ICT month, the CSV detail, the CSV summary, the Costs page total and the cap usage match to the cent.
12. The nightly backup runs and the restore drill passes before staff go live, then monthly.

## Screens are original

The layout follows the Create Videos → Library workflow observed on Fash. All UI code, copy, icons and images are new; nothing is copied from `fash-internal`.
