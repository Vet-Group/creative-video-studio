# UI and motion parity with Fash (change request UI-PARITY)

Owner request, 2026-10-23: the internal video app should look and move close to the Fash video screens, not only cover the same workflow. This is a requirement for run step **M.7**, not optional polish.

Source audit (read-only, kept outside this repository): `C:\Users\User\dev\work\fash-internal\VIDEO-PARITY-AUDIT-2026-10-23.md`, with the evidence in `fash-internal\evidence\motion-audit\2026-10-23T02-29-43Z\` (`report.json` and 12 screenshots at 1440×1000 and 390×844).

## Ground rules

- **Rebuild, never copy.** Layout, spacing, hierarchy, card shapes and motion behaviour are rebuilt in our own code. No Fash HTML, CSS, JavaScript, fonts, logos, images or videos enter this repository, and `fash-internal` and its evidence are not committed here (PRD, "Screens are original").
- **Keep the working base.** Upload, jobs, ledger, caps, auth, verdicts, delete/purge, Library playback and download stay as built in M.1–M.5 and D.1. M.7 changes the presentation layer only and must not change an API contract.
- **Show only what the backend supports.** Models, durations, ratios, resolutions and prices come from `/api/models` (`ModelConfig` from B.1, `estimateUsd`). Fash model names, credit prices and labels are never configuration.
- **Video only.** No pricing, upgrade, credits, image generation, Try-On, Apps or Marketing entries, even where the Fash sidebar has them.
- **The reference server on port 4317 is not this app.** It belongs to `fash-internal` and still has empty video sources (audit P1). Restoring it is not scheduled (Codex currently only reviews) and is **not a dependency of M.7**: M.7 is built from the audit evidence and local fixtures. Fixing 4317 changes nothing here, and the reverse is also true.

## Breakpoints (one rule)

- **1024 px and wider:** persistent left sidebar; Create is two columns (settings card on the left, Examples/History pane on the right).
- **Below 1024 px (tablets and phones):** top bar with a menu button and the page title; the sidebar becomes an overlay drawer. Create becomes tabs **Create / History / Examples**, with the form under Create and the Run button in a sticky bottom bar.
- Observed on Fash only at 390×844 and 1440×1000 (`live-*-narrow.png`, `live-*-desktop.png`): at 390 px it shows the top bar with a menu button and "Video Generation", tabs Create / History / Examples / About, and a sticky Run bar. Fash was **not measured between 391 and 1439 px**, so applying the phone layout up to 1023 px is an internal decision.
- Tests run on both sides of the breakpoint: 1023×800 and 1024×800, besides the three baseline viewports.

## Narrow measurements from the audit (`report.json`, 390×844, Fash live)

| Route | Videos in DOM | With a source | Moving in the sample | Moving and in view | Notes |
|---|---:|---:|---:|---:|---|
| `/dashboard` | 27 | 22 | 16 | 2 | All muted, loop, `playsInline`, poster and lazy source; 6 report a media error; tool cards 300 px wide and model cards 180 px wide, 12 px gap, first card at x = 16 (carousel transform 16 px; the local snapshot kept 48 px) |
| `/dashboard/create-videos` | 39 | 1 | 1 | 1 | Only the preset banner clip (291×130 at x = 40) is in view; the Examples clips sit under the Examples tab |

These are single samples of about 1.4 s; a clip without a source may still be lazy-loading.

> Follow-up: M.7 ended with C4 not met. The measured fix list for step M.7b is in [`UI-MOTION-PARITY-M7B.md`](UI-MOTION-PARITY-M7B.md); where they differ, its measured targets win.

## Parity matrix

"Same" = rebuild to match the Fash layout and behaviour at the stated viewports. "Internal" = deliberately different for an internal tool. Viewports: 1440×1000, 1280×800 and 390×844.

| Screen / component | State | Fash reference (evidence) | Target in this app | Kind | Test |
|---|---|---|---|---|---|
| App shell | all | Left sidebar with logo, account, nav items, active pill (`live-create-videos-desktop.png`) | Left sidebar: company logo, Create, Library, Admin (Admins only), user menu; active pill; collapses to a top bar with a menu button below 1024 px | Same layout, internal items | Screenshot at 3 viewports; keyboard focus order; nav works without a mouse |
| App shell | below 1024 px | At 390 px: top bar with a menu button and the page title; sidebar behind the toggle (`live-*-narrow.png`) | Top bar with a menu button and the page title; the button opens an overlay drawer; Esc closes it and returns focus | Same | e2e: open/close by keyboard; screenshots at 390×844 and 1023×800 |
| Create: settings card | default | White rounded card on the left: preset banner, image drop zone, model, prompt, resolution, duration, ratio, audio, Run (`live-create-videos-desktop.png`) | Same card order: preset banner, 1–4 image drop zone, model, prompt, the settings `/api/models` allows for the model, Run with the per-clip estimate in USD | Same layout; internal fields and price | Screenshot; e2e: changing the model hides unsupported options |
| Create: preset banner | default / chosen | Image banner with the preset name and a "Prompts" chip | Banner with the company preset's poster or muted loop and its name; opens the preset picker | Same | e2e: picking a preset fills prompt and settings and **does not submit** |
| Create: tabs | Examples / History (and Create below 1024 px) | Desktop: tabs History, Examples, About above a 3-column masonry of looping clips. At 390 px: tabs Create, History, Examples, About, form under Create, sticky Run bar | Desktop: tabs **Examples** and **History** in the right pane. Below 1024 px: tabs **Create / History / Examples**, sticky Run bar. No About tab | Same layout, internal content | e2e: tab switch by keyboard at both sides of 1024 px; screenshot of each tab |
| Create: Examples grid | loading / playing / error / reduced motion | Masonry, clips autoplay muted when visible | Masonry keeping each clip's aspect ratio; poster first, then muted loop `playsInline` only while visible; at most 4 playing at once; pauses off-screen and in a hidden tab; poster with a play button under `prefers-reduced-motion` or when autoplay is blocked; a broken source keeps a poster-sized placeholder, never a blank gap | Same look; better playback rules | Playback test (below); reduced-motion test; error-source test |
| Create: Examples card | hover / click | **Not recorded on Fash (unverified).** | Internal design decision: click shows the preset's details and a "use this sample" button, which fills the form; a **sample** label (Vietnamese UI copy) on every example clip | Internal | e2e: no job is created by clicking |
| Create: job state | submitted / running / done / failed | Not captured (would need a paid Fash job) | Existing job tray and states from M.4, restyled; finished clips show **MOCK** when from the mock provider | Internal | Existing M.4 e2e stays green |
| Library | grid | Library page (empty on Fash during capture) | Card grid with poster, duration, model, status, verdict; player with controls on open; download; reuse settings | Internal content, Fash card style | Existing flow and mobile e2e stay green; screenshot |
| Library: player | open | — | Controls, sound only when the user turns it on, `preload="metadata"`, range requests for seek | Internal | Existing `play()` / `currentTime` checks |
| Small dashboard | — | Fash `/dashboard` is a marketing-style explorer with model carousels | **Not built as a separate landing page.** Its useful parts (model cards with a sample loop and per-clip price) live in the Create preset picker and model menu | Internal | — |
| Carousels | narrow | Swiper; at 390 px the first card sits at x = 16 with 12 px gaps (tool cards 300 px, model cards 180 px); the local snapshot kept the 48 px desktop transform (audit P2) | Native horizontal scroll with scroll-snap, 16 px side padding and 12 px gaps from CSS, never a stored transform; arrow buttons on desktop, swipe and arrow keys everywhere | Same feel, own code | e2e: scroll by keyboard and by drag at 390×844 |

## Media for previews

> Update 2026-10-26: the owner accepted the copyright risk of the reference site's sample media (2026-10-25) and asked for every card that loops there to loop here too. Those samples live only in the bucket under `samples/` (PR #67), never in Git. `components/CardMedia.tsx` plays a card's `<name>.mp4` loop while it is on screen and keeps `<name>.jpg` as the poster (reduced motion keeps the poster, except on the Explore prompt grid, the Explore model cards and the Apps cards and app headers, which loop under reduced motion as the reference site's do). Names: `feature-<tool>`, `model-<id with dashes>`, `preset-<id>` (`preset-general` is the free prompt), `app-<slug>`, `marketing-format-ugc`, `marketing-hook-<id>`, `marketing-location-<id>`, `example-<n>` (11 to 35 appear only when uploaded) and `try-on-about`. The rules below describe the earlier fixture-only period.

- Example clips and preset posters are company media: clips from the bake-off (B.5, real company products) once they exist, and before that short fixture clips generated locally (for example with ffmpeg from company sample images) and marked as fixtures. No Fash video or poster is downloaded into this repository.
- **M.7 does not wait for B.3, B.5 or funding.** If no company media exists yet, M.7 makes fixture clips locally (for example ffmpeg pans and zooms over company or generated test images), stores them as test fixtures with a visible **fixture** label, and uses them for layout and playback tests. No paid render is made for M.7.
- A poster is a fallback, never evidence of motion: the playback tests must run on real video files.
- The 10 company sample images from B.3 are the poster source until real clips exist.
- Real job output and examples are never mixed: examples carry the sample label, mock output carries "MOCK".

## Acceptance (M.7)

**M.7 is done only when every core item holds.** Core items cannot be deferred:

- **C1** Examples clips play from valid local sources (fixture or company clips) and move: `currentTime` and, where supported, the decoded frame count advance in the playback test.
- **C2** Fallbacks work: a broken source keeps a poster-sized placeholder; blocked autoplay and `prefers-reduced-motion` show a poster with a play button.
- **C3** Create and Library work at 1440×1000, 1280×800, 1024×800, 1023×800 and 390×844, including the drawer, the Create tabs and the sticky Run bar below 1024 px.
- **C4** Evidence is attached: playback test logs and the screenshot comparison (item 7 below).

Cosmetic rows of the matrix (spacing, shadows, icon choice) may be marked "deferred" with a reason in `docs/STATUS.md`. The approved skip policy is unchanged: D.5 depends on M.7 softly, so the deploy can still go if M.7 ends skipped or stuck. In that case, or if a core item is missing, `docs/STATUS.md`, the run log and the P.1 report must say **"UI and motion parity not met"** and list the missing core items; merging documents is not parity.

1. The matrix is implemented, apart from cosmetic rows deferred as above.
2. **Screenshot baselines** at 1440×1000, 1280×800, 1024×800, 1023×800 and 390×844 for `/create` (each tab), `/library` and the narrow drawer. Screenshots use fixed fixture data, a frozen clock and posters (videos paused at frame 0) so two runs compare the same frame.
3. **Playback tests**, separate from screenshots: wait for `readyState >= 2`, then assert that `currentTime` advances and, where the browser supports it, `getVideoPlaybackQuality().totalVideoFrames` increases; scroll the clip out of view and assert it pauses; hide the tab (`visibilitychange`) and assert it pauses; with `reducedMotion: 'reduce'` assert no example autoplays; assert no more than 4 examples play at once.
4. **Interaction tests:** carousel and tab navigation by keyboard and by drag at 390×844, tabs on both sides of 1024 px; choosing a preset fills the form and creates no job.
5. **No regressions:** the existing unit, integration and e2e suites (including mobile playback and download) pass on the M.7 head in CI.
6. **No paid calls:** every M.7 test uses the mock provider and fixtures. Real provider work stays in the bake-off under its own budget gate.
7. The PR description shows the desktop and 390 px screenshots of `/create` next to the matching Fash audit screenshots for review.

## VET identity (2026-10-26)

Colours and logo moved to VET identity; the Fash layout parity is kept. Every colour in `globals.css` is a token on `:root`; the primary buttons use `--brand` (`#dc2626`, hover `#b91c1c`) and links use `--link` (`#b91c1c`, AA on white and on the zinc fills); the VET logo replaces the "CV" tile in the sidebar brand and sits at the right end of the narrow top bar. The geometry checks that asserted the black primary button now assert `rgb(220, 38, 38)`. The parity screenshot baselines are unchanged: `e2e/screenshot.css` points the brand tokens back to the Fash colours for screenshots only, so the owner's pending comparison still uses the same baselines, and the brand colours are asserted by the geometry checks and `e2e/brand.e2e.test.ts`.

## Not measured on Fash (internal decisions stand)

- What clicking an Examples card does on Fash: not recorded. The internal behaviour above is a design decision, not a measurement.
- Fash layout between 391 and 1439 px: not measured. The 1024 px rule above is a design decision.

Neither blocks M.7. If someone later measures them, the matrix is updated in a follow-up PR; nobody is assigned to it now.
