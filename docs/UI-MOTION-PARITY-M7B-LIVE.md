# M.7b live addendum: the live reference vs the 4317 targets

Source: live https://fash.studio/dashboard/create-videos, logged in, BrowserSkill instance a6d16171, measured 2026-10-23, read-only (no Run, no upload). Device pixel ratio 1.25, so a 1px border computes to 0.8px. Raw data and the live screenshots are kept outside the repository, in the owner's ops folder (`m7b-live`).

Verdicts: **match** (live agrees with the 4317 target), **differs** (fix the target to live), **refine** (target right, live adds detail to copy), **n/a** (cannot be measured on live).

## Sidebar and frame (1440x1000)

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| S1 | 240 px, rgb(250,250,250), no border, padding 16px 16px 32px, fixed | 240x1000 fixed, rgb(250,250,250), padding 16px 16px 32px, no border | match |
| S2 | 208x37, padding 8px 12px, 14px/21px 500, black text | 208x37, padding 8px 12px, 14px/21px 500; label rgb(77,77,77) inactive, rgb(26,26,26) active; label transition opacity/visibility .18s | differs: inactive label is rgb(77,77,77), not black |
| S3 | rgb(242,242,242), radius 10px, black 500 | on the `li`: rgb(242,242,242), radius 10px, text rgb(26,26,26) 500; hover uses the same bg | match (hover = active bg) |
| S4 | 14px glyph rgb(128,128,128), 20 px slot | 14px, 20 px slot at x=28; rgb(128,128,128) inactive, rgb(26,26,26) on the active item | refine: active icon turns rgb(26,26,26) |
| S5 | main padding 16px 48px 0, card at x=288 | main padding 16px 48px 0 288px, card x=288 | match |
| S6 | white page, Inter-like, 16px/24px | white, `Inter, Arial, sans-serif` 16px/24px; Inter variable 100-900 is loaded (plus Font Awesome 6 Pro/Sharp for icons) | refine: the rendered font is Inter itself |

## Card

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| C1 | 320 px, radius 24, shadow 0 12px 40px rgba(0,0,0,.12), padding 24 | 320x976 at (288,16), radius 24, same shadow, padding 24, overflow hidden, flex column | match |
| C2 | sticky top 16, height viewport-24, form scrolls inside, Run pinned at the bottom | sticky wrapper top 16, height 976 at 1000; form area 276x855 with padding 0 4px 14px; Run wrapper has **border-top 0.8px solid rgb(204,204,204)** and padding-top 16 (73 tall) | differs: add the divider line above Run |
| C3 | 268x130, radius 18, title centred 24/600 white, chip top-right | 268x130 at y=40, radius 18; title 24/600 white in a box with padding 10px 14px, radius 10; chip 86x26, radius 16, padding 4px 12px, 12px/18px white; the banner is a looping video with a poster | refine: chip size and banner video |
| C4 | no page h1 on Create at desktop; at 390 only the top bar title | no h1 at 1440; at 390 only "Video Generation" in the top bar | match (the owner sign-off stays with the owner) |

## Upload

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| U1 | hidden input, zone clickable and keyboard-focusable | no `input[type=file]` in the DOM until used; zone `cursor: pointer`, **tabindex -1** (not focusable on live) | refine: keep our keyboard focus (accessibility beats live) |
| U2 | 268x130, 1px dashed rgb(153,153,153), radius 18, column gap 6 | 268x130 at y=186, 0.8px (=1px) dashed rgb(153,153,153), radius 18, column, gap 6; transition border-color .15s, background-color .15s | match, plus the transition |
| U3 | 36 px circle rgba(0,0,0,.06), glyph rgb(102,102,102), 14px grey hint | 36x36, radius 50%, rgba(0,0,0,.06), glyph 14px rgb(102,102,102); hint 14px rgb(102,102,102), line-height 18.2px | match |
| U4 | thumbs inside the zone, radius 12, remove top-right | not measured: needs an upload | n/a |

## Controls

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| K1 | 14px/21px 500 black, 6px above the control | same; label block 66 tall with the control | match |
| K2 | 39 px, rgb(242,242,242), radius 8, 1px transparent border, padding 8px 10px, chevron, **16px** text | 268x38.6, rgb(242,242,242), 0.8px transparent border, radius 8, padding 8px 10px, **14px/21px** text, leading icon before the value, transition border-color .15s; open state shows a grey border and an up chevron | differs: value text is 14px; add the leading icon and the open-state border |
| K3 | same grey select showing the model | same trigger; the popover is a separate floating panel (see "Model popover" below) | refine |
| K4 | wrapper rgb(242,242,242), 1px rgb(230,230,230), radius 8, padding 0 8px 8px; textarea 14/21, 75 tall | wrapper 268x121, same colours, padding 0 8px 8px, gap 6; textarea 250x75, 14px/21px, padding 8px 0, transparent | match |

## Tabs

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| T1 | 37 tall, padding 8px 20px, radius 8, 14/600, active black/white, inactive rgb(102,102,102) | same | match |
| T2 | centred over the grid, top y=24 | tabs centre 1008.5 = grid centre 1008.5, top y=24 | match |
| T3 | below 1024: equal pills 30 tall, padding 6px 4px, radius 8, 12/600, 2px gap | 4 pills 88x30 (Create/History/Examples/About), same styles, gap 2; wrapper sticky top 0, z-index 30, white; it slides under the z-99 top bar when the page scrolls. **Live switches at 768, not 1024** (see "Breakpoints") | differs: breakpoint |

## Grid

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| G1 | 3 flex columns of 245 in 752, gaps 8 | 3 flex columns of 240 in 737 (columns at x 640/888/1137), gap 8; the 15 px difference is the vertical scrollbar | match (same rule: fill the width less the 48px right padding) |
| G2 | 16:9, 1:1, 3:4, 9:16 tiles | 240x135, 240x240, 240x320, 240x427; first 12 heights 320,135,427,427,240,135,135,427,427,135,135,135 | match |
| G3 | radius 14, overflow hidden, pointer, overlay caption | radius 14; hover lift and a "Recreate" button (see "Tile hover") | refine |
| G4 | grid top y=81, right padding 48 | top y=81, right edge 1377 = 1425-48 | match |

## Run

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| R1 | 272x56 pinned at the card bottom, visible at 1440x1000 and 1280x800 | 272x56 at y=912 (1440x1000) and y=712 (1280x800, 1024x800) | match |
| R2 | black, white 16/500, radius 8, padding 12px 16px, gap 12, cost inside | same; label "Run [credit icon] 555" | match |

## Narrow (390x844, mobile emulation)

| Row | 4317 target | Live value | Verdict |
|---|---|---|---|
| N1 | 57 tall, sticky, white, **no border**; menu 40x40 radius 10; title 18/600 rgb(26,26,26) | 390x56.8, sticky top 0, z-index 99, white, **border-bottom 0.8px solid rgba(0,0,0,.1)**, padding 8px 0; menu button 40x40 at (0,8), radius 10, no bg or border, aria-label "Open menu"; title 18/600 rgb(26,26,26) at x=52 | differs: there is a hairline bottom border |
| N2 | top bar title only | top bar title only | match |
| N3 | 358 wide at x=16, radius 8, same shadow, padding 24, tabs at y=73 | card 358x713 at (16,119), radius 8, same shadow, padding 24, overflow hidden; tabs at y=73 | match |
| N4 | Run 358x60, pinned to the viewport bottom (y≈772), no white bar | Run 358x60 at y=772, radius 8, but `position: static` inside the card: the card is sized so Run ends 12 px above the viewport bottom. Create page height is 856 (barely scrolls) | refine: same pixels, but it is not a fixed bar |

## New rows (not in the 4317 list)

| Row | Live value | Suggested target |
|---|---|---|
| Model popover | `position: fixed`, 8 px right of the trigger, top aligned with it (588,359), 334x446; white, radius 8, shadow rgba(0,0,0,.12) 0 4px 16px, z-index 200; search 292x29 rgb(242,242,242) radius 8 14px; section heads 10px/700 rgb(153,153,153) uppercase, letter-spacing .5px ("Featured models", "All models"); rows 56 tall, padding 6px 12px, selected rgba(0,0,0,.06) with a check on the right; each row has the name, a "NEW" badge and a resolution/duration sub-line | Match as a side popover for the model picker (keep our pass-rate and estimate in the sub-line) |
| Select popover (resolution) | absolute, 3 px below the trigger, width 266 (trigger width), max-height 280, overflow auto, padding-top 6; heading row "Select resolution" 36 tall, padding 10px 16px 8px; option rows 67 tall (value plus pixel-size sub-line), padding 10px 16px; selected rgba(0,0,0,.06); last row radius 0 0 8 8 | Match for the other selects |
| Hover | nav: item bg rgb(242,242,242); tile: wrapper translateY(-3px), shadow rgba(0,0,0,.13) 0 8px 28px, transition transform .2s, box-shadow .2s; a "Recreate" button 180x46, radius 8, centred 15 px from the bottom, fades in (opacity .18s ease-in-out). On touch (390 mobile) the button is always visible | Match; our label for the button is the owner's choice |
| Focus | Tab from the model trigger moves focus into the popover search; outline-style none, no ring visible | Inconclusive on live; keep a visible focus ring (accessibility) |
| Drawer motion | panel fixed, z-index 999, width **85vw** (332 at 390, 653 at 768, no max-width), bg rgb(250,250,250), padding 16, no shadow, `transition: transform .28s cubic-bezier(.2,.7,.2,1)`; overlay fixed z-index 998, rgba(0,0,0,.5), `transition: opacity .28s`; body overflow hidden while open. **Escape does not close it**; an overlay click does | Match the motion; also close on Escape (accessibility) |
| Drawer content | account row (avatar, user name, settings gear), nav items 300x37 (padding 8px 12px, 14px; inactive label rgb(77,77,77) icon rgb(128,128,128); active bg rgb(242,242,242) radius 10, label and icon rgb(26,26,26)); black "Upgrade Your Plan" button with a "55% OFF" badge at the bottom | Match the nav; skip the upgrade promo (not our product) |
| Breakpoints | desktop layout down to 770; narrow layout (no sidebar, top bar, 4 tabs, Run 60 tall) from 768 down. Grid: 3 columns at ≥1024 (1100: 127 px columns), 2 columns at ≤1023, columns shrink to 29 px at 770 | Keep our 1024 switch: live 770-1023 is cramped (2 columns of 29-156 px), so copying 768 would copy a defect. Owner call |
| Rendered font | Inter variable (100-900) loaded; body `Inter, Arial, sans-serif` | Self-host Inter |
| Autoplay | 39 videos; visible tiles play (currentTime advanced ~1 s in 1 s), the banner loops; off-screen tiles have no `src` (lazy) and stay paused at 0; only the banner has a poster | Lazy src plus autoplay in view (our MAX_PLAYING cap is fine) |
| History empty state | "No videos generated yet. Start creating!" 14px rgb(102,102,102) | Match the style |

## Not measurable

- U4 thumbnails: needs an upload (forbidden).
- Run in its disabled or loading state, and the job progress UI: need a generation (forbidden).
- The focus ring on live is inconclusive (see "Focus").
- The first narrow paint after a resize from desktop showed the create card and the Examples grid stacked, with the Examples tab active (`live-390x844-create-scrolled.png`). It looks like a resize artefact, not a designed state.

## Decisions for M.7b

Where live and the 4317 list differ, live wins: S2, C2, K2 and N1 take the live values above. These differences from live are intended and must be listed in the M.7b PR. None of them excuses another gap.

| Topic | Live | M.7b | Why |
|---|---|---|---|
| Layout switch | narrow layout from 768 down; 770-1023 keeps the desktop layout with a 2-column grid of 29-156 px columns | keep the 1024 px switch from M.7 (decided 2026-10-23) | the live 770-1023 range is cramped; the live Examples helper also switches its grid at 1024 |
| Drawer close | overlay click only | overlay click **and** Escape | keyboard accessibility |
| Focus | no visible focus ring | visible focus ring | keyboard accessibility |
| Upload zone | not keyboard-focusable | focusable, opens the file picker on Enter or Space | keyboard accessibility |
| Narrow Run | static inside a card sized to the viewport | same pixels (358x60, 12 px above the bottom); a sticky bar is acceptable only if the pixels match | same look |
| Tile hover button | "Recreate" | our "use this sample" action, same size, place and fade | internal wording |
| Drawer content | account row, nav, upgrade promo | account row and nav; no upgrade promo | out of scope |
| Audio | an audio on/off control in the Create card | no audio control (decided 2026-10-23) | the PRD has no audio, and the models are priced and called with audio off |
| Example dialog (V01) | Measured 2026-10-23 at 1440x1000 and 390x844: 1100x501 (358x737 stacked at 390), clip on black with Close (32 px, radius 10) at its top-left, a details column (preset chip, model, input thumbnail, spec pills, date), four 32 px tools (Rerun, Download, Compress & Download, Open in new tab) above a 187x36 "Recreate" button, and 48 px round Previous/Next (36 px at 390) fixed 24 px from the viewport edges; Previous is absent on the first sample | same geometry; the chip shows the preset, the heading the sample title, the date slot says it is a fixture; two tools (download, open in new tab) at the same size and positions; Previous/Next stop at the ends; "use this sample" only fills the form | no job from a sample, so no Rerun, Compress or Recreate |
| Upload limit (V02) | the image count follows the model (9 to 7 from Seedance to Kling) | the hint and the picker follow the chosen model's `maxImages`, capped at 4 | the limits come from `/api/models`, not from the reference |
| Examples columns (V09) | 2 columns, 3 from 1024 px, 4 from 1536 px; each tile goes to the shortest column | same | read from the reference script, not measured at 1536 |
| Off-screen play (V10) | clips may play up to two screens outside the viewport | play only on screen, at most 4, paused in a hidden tab | performance; not the reference behaviour |
| Font | Inter variable | self-host Inter from its open-licence distribution and note the source | rendered font must match |

V01, V02, V09 and V10 come from the REA-video pass of 2026-10-23 (live, read-only, no job; report kept outside the repo in `fash-internal/evidence/rea-video/2026-10-23-video-pass/`). It also observed the Library request and its empty response (V07, V08), the run payload and job events in the reference script (V03 to V06) and per-component breakpoints (V12). None of those change the app: its own API, job tray and Library stay.
