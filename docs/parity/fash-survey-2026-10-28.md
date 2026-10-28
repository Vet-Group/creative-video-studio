# fash.studio survey inventory (2026-10-28)

Parity inventory for the reference site, taken for the full-pass plan. The screenshots, measurements, page text and click logs live outside the repo
(`Documents/ops/creative-video-studio/fash-recordings/14-survey-2026-10-28/`, one folder per page). They are not committed, because they show the
owner's account. Every row says what the reference has, what we have, and its status: cloned, already matches, approved difference, or queued with
the story that takes it.

Survey by a browser automation CLI (bsk) in an Agent Window on the owner's signed-in Chrome, click guard `fguard.py` (scratchpad), click log per page folder. Status labels (AC2): cloned / already matches / approved difference / not cloneable, or queued while pending.

## Marketing Studio (`marketing-studio/`, 26 PNG, measure/text/media json)

| # | Screen / state | Fash evidence | Ours today | Status | Target |
|---|----------------|---------------|-----------|--------|--------|
| M1 | UGC form default (format card, Model, Product, Hook, Location, Prompt, ratio, duration, Run) | 01-default-1440, 09-form-filled-1440.measure.json | same fields, plus approved model select + audio switch | already matches | - |
| M2 | Format picker: UGC Try On, Advanced, Unboxing (Coming Soon), Product Review (Coming Soon) | 02-format-dialog-1440 | FORMATS dialog | already matches (verify coming-soon cards in grading) | US-008 |
| M3 | Model picker: "Choose model" grid of 8 stock models (cdn public models/model-1..8.jpg), 4 per row 163x217 | 03-model-picker-1440, 03-model-picker.json | Choose model dialog from `marketing-model-<n>` samples, plus an own-photo tile | cloned (#120) | - |
| M4 | Product picker: "Upload your own product" tile + "My Products" (all past product uploads) | 04-product-picker-1440, 04-product-picker.json | product picker with "Upload your own product" and the member's past product uploads (#126) | cloned | - |
| M5 | Selected slot: image fills tile, dark chip label bottom-left (Product / hook name / location name), X top-right | 07-ratio-menu-1440, 05b, 06b | filled slot fills the tile with a dark chip label and an X (#125) | cloned | - |
| M6 | Hook dialog "Open With a Hook": 6 video tiles 156x208 with title + one-line description | 05-hook-dialog-1440/json | same 6 hooks, ChoiceDialog | already matches | - |
| M7 | Location dialog "Pick the Perfect Location": 11 video tiles | 06-location-dialog-1440/json | same 11 | already matches | - |
| M8 | Ratio menu: "Aspect Ratio" header, 9:16 / 16:9 / 1:1 with icons and check | 07-ratio-menu-1440 | Select | already matches (graded) | - |
| M9 | Duration menu: 3s..15s list | 08-duration-menu-1440 | Select | already matches | - |
| M10 | History card: video left; right column title (format), prompt (scroll), input thumbnails (model, product, hook, location), chips duration + ratio, date, icon actions (regenerate, download, fullscreen, open in new tab, favorite, delete), "Recreate" | 10-history-card-hover-1440, 10-history-card-actions.txt | History card: result left; side column with title, the member's words, input thumbnails, ratio and length chips, status and date, download / fullscreen / open in new tab / favourite / delete, reuse link | cloned | regenerate is the reuse link (no paid run) |
| M11 | Examples tab: format loops + company examples | 11-examples-1440, 11-examples-media.json | Gallery marketing-example- | already matches (media check in US-013) | US-013 |
| M12 | About tab (UGC): long article, 17.8k chars | 12-about-1440 full page, 12-about-text.md | About renderer | queued (text/sections diff) | US-013 |
| M13 | Advanced default: refs slot "Up to 7 reference images", Hook, Location, Prompt, Script, ratio, duration, Generate Audio switch, Run | 20-advanced-default-1440 | same + approved model select | already matches | - |
| M14 | Advanced refs filled: 3-per-row thumbnails with X, plus tile | 22-advanced-refs-filled-1440 | 3-per-row square reference tiles with X and a same-size plus tile (#127) | cloned | - |
| M15 | Advanced Examples / About (8.4k chars) | 23, 24, 24-advanced-about-text.md | About renderer | queued | US-013 |
| M16 | 390: interstitial "Get the best performance on desktop" + Continue on mobile | 31a-mobile-interstitial-390 | none | approved difference candidate: not cloned (our app is mobile-first; an interstitial would only add a tap) | - |
| M17 | 390 Advanced/UGC: Create/History/Examples/About tabs, form card, sticky Run | 30-advanced-390, 31-ugc-390, 32-ugc-390-full | same pattern | already matches (graded r16 create-mobile) | grading |
| M18 | Run shows a credit price ("Run 302") | all | USD cost | approved difference | - |
| M19 | Recreate / regenerate / Run | - | reuse link refills the form (#119) | cloned as refill without a run (paid actions were never pressed) | - |

## Create Videos (`create-videos/`)

| # | Screen / state | Fash evidence | Ours today | Status | Target |
|---|----------------|---------------|-----------|--------|--------|
| C1 | Default form (image slot, prompt, Prompts button, Enhance pill, ratio/duration/model, Run) | 01-default-1440 + measure | same (graded r16 >= 90) | already matches | - |
| C2 | "Steal Our Prompts" dialog: General + 19 templates | 02-prompts-dialog-1440/json | preset picker with the same 19 + free prompt | already matches | - |
| C3 | History tab: cards with video + side panel (title, prompt, inputs, chips, date, actions, Recreate) | 02/03-history-1440 | the same History card on every page with a History tab | cloned | - |
| C4 | Examples tab | 03-examples-1440, media json | Gallery video-example- | already matches | - |
| C5 | About tab (27k chars) | 04-about-1440, 04-about-text.md | About renderer | queued (text/image diff) | US-013 |

## Try On / Image Generation (`try-on/`, `image-generation/`)

| # | Screen / state | Fash evidence | Ours today | Status | Target |
|---|----------------|---------------|-----------|--------|--------|
| T1 | Try On form with sample tiles | try-on/01-default | same, samples bucket (graded r18 93) | already matches | - |
| T2 | Try On History / Examples / About | try-on/02-04 | Tray / Gallery / About | queued (History card, About text) | US-013 |
| I1 | Image Generation form | image-generation/01-default | same | already matches | - |
| I2 | Image Generation History / Examples / About | image-generation/02-04 | Tray / Gallery / About | queued (History card, About text) | US-013 |
| R1 | Reuse from History on Try On / Image / apps | - (Recreate never pressed) | reuse link on every page that refills (#128); Motion Control keeps no refill | shipped | - |

## Explore (`explore/`)

| # | Screen / state | Fash evidence | Ours today | Status | Target |
|---|----------------|---------------|-----------|--------|--------|
| E1 | Explore feed (cards per feature, full page) | 01-default, 02-full, 02-text.md | Explore page | already matches (graded earlier rounds) | grading |
| E2 | "Use this template" from an Explore card into the feature page | not pressed (card click opens a feature page) | Explore model cards open Create or Image Generation on that model, prompt cards open Create on the preset; a "use this template" link on every company result in the Examples tab (Try On, Image Generation, Marketing Studio) fills the form from its inputs; saved personal and company templates (#129) on every form | shipped | - |

## Apps (`apps/`, 10 app folders)

| # | Screen / state | Fash evidence | Ours today | Status | Target |
|---|----------------|---------------|-----------|--------|--------|
| A1 | Apps index (10 apps) | 01-index-1440, app-links.json | 9 apps (AppsIndex) | already matches for 9 | - |
| A2 | Jewelry Try-On (new on Fash) | apps/jewelry-try-on/ default + About | missing | queued: candidate new app (one model call like Try On, no new provider) | US-014 |
| A3 | Each app: default + About | apps/<slug>/ | AppPage + About | queued (About text diff) | US-013 |

## Library (`library/`)

| # | Screen / state | Fash evidence | Ours today | Status | Target |
|---|----------------|---------------|-----------|--------|--------|
| L1 | Filters: All / Images / Videos / Try-On / Image Generation / Video Generation / Marketing Studio / Apps, Favorites only, Newest/Oldest, size slider | 01-default-1440, 01-text.md | kinds, creator, ratio, sort, size slider, favorites | already matches | - |
| L2 | Filter by Marketing Studio | 02-filter-marketing-1440 | feature tag + kinds | already matches | - |
| L3 | Item detail lightbox: 760x760 media, side panel (title, prompt, input thumbnails, duration/ratio chips, date, download / fullscreen / open in new tab / copy, Recreate), next arrow | 03-item-detail-1440, 03-item-detail.json | item detail view from each card: the result large on a dark panel, a 220 px side column (title, the words, input thumbnails, chips, creator and date, download / fullscreen / open in new tab / copy, reuse link), previous and next arrows, Esc closes | cloned | - |

AC3 audit (all pages): 77 logged actions, 0 forbidden buttons clicked, refusals logged (`click-log-all.ndjson`). bsk sessions `woxd` and `qxnw` stopped 2026-10-28.

## Settings (`settings/`)

| # | Screen / state | Fash evidence | Ours today | Status | Target |
|---|----------------|---------------|-----------|--------|--------|
| S1 | Settings dialog: Account list (Profile, Billing, Connected apps, Support, Logout) beside the pane | 01-settings-menu-1440 | Settings dialog: Profile, Linked accounts, Support, sign out | already matches (same dialog shape) | - |
| S2 | Profile: first/last name, phone with country, company, web address, Save | 01-settings-menu-1440 | name and email from the company account | approved difference: profile data comes from the company account (Admin), not self-service |  - |
| S3 | Billing: plan, credits left, Top-Up, invoices (Stripe) | 02-billing-1440 | none | approved difference: internal app, real USD cost shown per Run and on the Admin Costs page, no credits or plans | - |
| S4 | Connected apps: "No connected apps" (MCP for AI assistants) | 02-connected-apps-1440 | Linked accounts (Google, Lark sign-in) | approved difference: no external assistant access to company media | - |
| S5 | Support: subject + message form, Send | 02-support-1440 | support email or "ask the Admin" | approved difference: an internal team reaches the Admin directly; no ticket backend | - |
