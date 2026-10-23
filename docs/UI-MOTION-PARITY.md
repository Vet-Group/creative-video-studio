# UI and motion parity with Fash (change request UI-PARITY)

Owner request, 2026-10-23: the internal video app should look and move close to the Fash video screens, not only cover the same workflow. This is a requirement for run step **M.7**, not optional polish.

Source audit (read-only, kept outside this repository): `C:\Users\User\dev\work\fash-internal\VIDEO-PARITY-AUDIT-2026-10-23.md`, with the evidence in `fash-internal\evidence\motion-audit\2026-10-23T02-29-43Z\` (`report.json` and 12 screenshots at 1440×1000 and 390×844).

## Ground rules

- **Rebuild, never copy.** Layout, spacing, hierarchy, card shapes and motion behaviour are rebuilt in our own code. No Fash HTML, CSS, JavaScript, fonts, logos, images or videos enter this repository, and `fash-internal` and its evidence are not committed here (PRD, "Screens are original").
- **Keep the working base.** Upload, jobs, ledger, caps, auth, verdicts, delete/purge, Library playback and download stay as built in M.1–M.5 and D.1. M.7 changes the presentation layer only and must not change an API contract.
- **Show only what the backend supports.** Models, durations, ratios, resolutions and prices come from `/api/models` (`ModelConfig` from B.1, `estimateUsd`). Fash model names, credit prices and labels are never configuration.
- **Video only.** No pricing, upgrade, credits, image generation, Try-On, Apps or Marketing entries, even where the Fash sidebar has them.
- **The reference server on port 4317 is not this app.** It belongs to `fash-internal`, still has empty video sources (audit P1) and is restored separately; fixing it changes nothing here, and the reverse is also true.

## Parity matrix

"Same" = rebuild to match the Fash layout and behaviour at the stated viewports. "Internal" = deliberately different for an internal tool. Viewports: 1440×1000, 1280×800 and 390×844.

| Screen / component | State | Fash reference (evidence) | Target in this app | Kind | Test |
|---|---|---|---|---|---|
| App shell | all | Left sidebar with logo, account, nav items, active pill (`live-create-videos-desktop.png`) | Left sidebar: company logo, Create, Library, Admin (Admins only), user menu; active pill; collapses to a top bar with a menu button below 768 px | Same layout, internal items | Screenshot at 3 viewports; keyboard focus order; nav works without a mouse |
| App shell | narrow | Sidebar hidden behind a toggle (`live-*-narrow.png`) | Menu button opens an overlay drawer; Esc closes it and returns focus | Same | e2e: open/close by keyboard; screenshot 390×844 |
| Create: settings card | default | White rounded card on the left: preset banner, image drop zone, model, prompt, resolution, duration, ratio, audio, Run (`live-create-videos-desktop.png`) | Same card order: preset banner, 1–4 image drop zone, model, prompt, the settings `/api/models` allows for the model, Run with the per-clip estimate in USD | Same layout; internal fields and price | Screenshot; e2e: changing the model hides unsupported options |
| Create: preset banner | default / chosen | Image banner with the preset name and a "Prompts" chip | Banner with the company preset's poster or muted loop and its name; opens the preset picker | Same | e2e: picking a preset fills prompt and settings and **does not submit** |
| Create: right pane tabs | Examples / History | Tabs History, Examples, About; Examples is a 3-column masonry of looping clips | Tabs **Examples** (company sample clips and presets) and **History** (the user's recent jobs). No About tab | Same layout, internal content | e2e: tab switch by keyboard; screenshot of each tab |
| Create: Examples grid | loading / playing / error / reduced motion | Masonry, clips autoplay muted when visible | Masonry keeping each clip's aspect ratio; poster first, then muted loop `playsInline` only while visible; at most 4 playing at once; pauses off-screen and in a hidden tab; poster with a play button under `prefers-reduced-motion` or when autoplay is blocked; a broken source keeps a poster-sized placeholder, never a blank gap | Same look; better playback rules | Playback test (below); reduced-motion test; error-source test |
| Create: Examples card | hover / click | Click opens the example's prompt | Click shows the preset's details and a "use this sample" button, which fills the form; a **sample** label (Vietnamese UI copy) on every example clip | Same + label | e2e: no job is created by clicking |
| Create: job state | submitted / running / done / failed | Not captured (would need a paid Fash job) | Existing job tray and states from M.4, restyled; finished clips show **MOCK** when from the mock provider | Internal | Existing M.4 e2e stays green |
| Library | grid | Library page (empty on Fash during capture) | Card grid with poster, duration, model, status, verdict; player with controls on open; download; reuse settings | Internal content, Fash card style | Existing flow and mobile e2e stay green; screenshot |
| Library: player | open | — | Controls, sound only when the user turns it on, `preload="metadata"`, range requests for seek | Internal | Existing `play()` / `currentTime` checks |
| Small dashboard | — | Fash `/dashboard` is a marketing-style explorer with model carousels | **Not built as a separate landing page.** Its useful parts (model cards with a sample loop and per-clip price) live in the Create preset picker and model menu | Internal | — |
| Carousels | narrow | Swiper with a 16 px offset at 390 px; local snapshot kept the 48 px desktop transform (audit P2) | Native horizontal scroll with scroll-snap; offsets come from CSS, never a stored transform; arrow buttons on desktop, swipe and arrow keys everywhere | Same feel, own code | e2e: scroll by keyboard and by drag at 390×844 |

## Media for previews

- Example clips and preset posters are company media: clips from the bake-off (B.5, real company products) once they exist, and before that short fixture clips generated locally (for example with ffmpeg from company sample images) and marked as fixtures. No Fash video or poster is downloaded into this repository.
- The 10 company sample images from B.3 are the poster source until real clips exist.
- Real job output and examples are never mixed: examples carry the sample label, mock output carries "MOCK".

## Acceptance (M.7)

1. This matrix is implemented, or a row is marked "deferred" with a reason in `docs/STATUS.md`.
2. **Screenshot baselines** at 1440×1000, 1280×800 and 390×844 for `/create` (Examples and History), `/library` and the narrow drawer. Screenshots use fixed fixture data, a frozen clock and posters (videos paused at frame 0) so two runs compare the same frame.
3. **Playback tests**, separate from screenshots: wait for `readyState >= 2`, then assert that `currentTime` advances and, where the browser supports it, `getVideoPlaybackQuality().totalVideoFrames` increases; scroll the clip out of view and assert it pauses; hide the tab (`visibilitychange`) and assert it pauses; with `reducedMotion: 'reduce'` assert no example autoplays; assert no more than 4 examples play at once.
4. **Interaction tests:** carousel and tab navigation by keyboard and by drag at 390×844; choosing a preset fills the form and creates no job.
5. **No regressions:** the existing unit, integration and e2e suites (including mobile playback and download) pass on the M.7 head in CI.
6. **No paid calls:** every M.7 test uses the mock provider and fixtures. Real provider work stays in the bake-off under its own budget gate.
7. The PR description shows the three desktop/narrow screenshots next to the matching Fash audit screenshots for review.

## Open questions for the reference side (Codex, `fash-internal`)

- The exact Fash Examples behaviour on click (open a prompt panel, or fill the form) was not recorded; M.7 uses "show details, then fill on confirm".
- Fash sidebar collapse behaviour between 768 px and 1280 px was not measured; M.7 keeps the sidebar visible from 1024 px.
