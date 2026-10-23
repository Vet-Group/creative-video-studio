# M.7b fix list (measured from the reference, read-only)

C4 of `docs/UI-MOTION-PARITY.md` was not met: the owner compared the M.7 baselines with the reference screenshots and judged the look "not close enough". This list turns the visible gaps into measured targets for a follow-up round, M.7b.

**Goal (owner, 2026-10-23):** the video screens should look and move as close to the reference as possible, in layout, interface detail and motion, not only match it in function. Removing credits, Upgrade, Try-On, image generation and other SaaS items is not a reason to restyle the video part.

**Ground rules**
- Rebuild from measurements: own code, but the measured sizes, colours, spacing and radii, not a design "inspired by" the reference. No reference HTML, CSS, JS, fonts, icons or images enter this repository.
- Video-only scope stays. Do not add credits, the Upgrade button, Try-On, image generation, the audio toggle, the About tab or the Enhance chip. Each such omission is listed as an intended difference; it never excuses a layout, type or motion gap elsewhere.
- Keep the backend and every existing function (upload, model options, cost estimate, submit, job tray, library, admin). No paid call.
- **M.7b gates the deploy.** It is a run step in the `app` worktree after D.1. D.5 lists it under `gate`: only `done` releases the deploy; `skipped`, `stuck` or `doing` keep D.5 waiting. M.7b is done only when the owner accepts C4 (see "Done").

**Evidence sources**
- The live reference page (logged in) and saved live evidence are canonical. The port 4317 capture is a secondary, static source for geometry and CSS: it has no video sources and a known mobile carousel offset, so it is not the reference for motion or responsive states. Do not wait for 4317 to be fixed.
- Reuse the measurements below. Measure only what is missing or doubtful, on the live page, read-only (no upload, no Run, no credits), with the owner's browser profile `huuhungn` (instance `a6d16171`) only; if it is not connected, record the evidence as missing instead of switching profile.
- Record each measurement with route, viewport, state, time, source (`live`, `4317` or `internal decision`), bounding box and computed styles. Check the font actually rendered, not only the first `font-family` name. A live value that differs from a 4317 value below wins; the live addendum lists them.

**Order of work**
1. Overall geometry: sidebar, page background, content edges, card width, scrolling inside the card, Run position, gap between the columns, narrow layout.
2. Type and controls: rendered font, sizes and line heights, dropzone, selects, pill tabs, icons, borders, shadows, radii, hover and focus states.
3. Media and motion: staggered grid with mixed ratios, posters, autoplay in view, drawer, carousel, fallbacks.

**How it was measured:** `getComputedStyle` and `getBoundingClientRect` on `http://127.0.0.1:4317/dashboard/create-videos`, headless Chrome, at 1440×1000 and 390×844, read-only. "Current" comes from `apps/web/src/app/globals.css` on `main` at `6c4d052` and the M.7 baselines. Raw numbers are kept outside the repository.

### 1. Shell

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| S1 | Sidebar surface | 240 px, `#fff`, 1px right border | 240 px, `rgb(250,250,250)`, no border, padding 16px 16px 32px, fixed full height | Screenshot at 1440: sidebar 240 px wide, no divider line |
| S2 | Nav items | padding .55rem .75rem, 500 weight | 208×37 px rows, padding 8px 12px, 14px/21px weight 500, black text | Item box 208×37 at 1440 |
| S3 | Active item | `#e0e7ff` bg, blue text, 700 weight | `rgb(242,242,242)` bg, radius 10px, black text, weight 500 (no blue accent) | Active item computed bg `rgb(242,242,242)` |
| S4 | Nav icons | none | 14px glyph, `rgb(128,128,128)`, 20 px slot, before each label (own icon set) | Each nav item shows an icon |
| S5 | Page frame | `.frame` padding 1.5rem, max 90rem | main padding 16px 48px 0 (content starts 48 px right of the sidebar, card at x=288) | Card left edge at x=288 at 1440 |
| S6 | Page background and type | body `#f6f6f7`, system-ui | page `#fff`, one sans family (Inter-like metrics; self-hosted or system), base 16px/24px | Body bg `rgb(255,255,255)` |

### 2. Create card

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| C1 | Card size and shape | 26rem column, radius 1rem, 1px border, faint shadow | 320 px wide, radius 24px, no border, shadow `0 12px 40px rgba(0,0,0,.12)`, padding 24px | Card 320 px at 1440 |
| C2 | Card height and scroll | grows with content; page scrolls | `position: sticky; top: 16px`, height = viewport − 24px (976 at 1000); form area scrolls inside the card, Run stays pinned at the card bottom | At 1440×1000 the card fits the viewport and the Run button is visible without scrolling |
| C3 | Preset banner | aspect 16/7, radius .9rem, title bottom-left with a button | 268×130 px, radius 18px, title centred 24px/600 white; "Prompts"-style chip top-right (our "choose a preset" label, Vietnamese UI copy) | Banner box 268×130 |
| C4 | Duplicated page title | Create page h1 above the card | No page h1 on Create at ≥1024 px (the sidebar marks the page); at 390 px only the top bar title | One visible Create page title per viewport |

### 3. Upload

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| U1 | Native file input ("Choose Files / No file chosen") | visible | Hidden input behind a custom dropzone; whole zone clickable and keyboard-focusable; drag-and-drop kept | No native file button in screenshots; e2e uploads still pass |
| U2 | Dropzone box | 2px dashed `#a1a1aa`, `#fafafa` | 268×130 px, 1px dashed `rgb(153,153,153)`, radius 18px, column layout gap 6px, centred | Computed border `1px dashed rgb(153,153,153)` |
| U3 | Plus button | none | 36 px circle, bg `rgba(0,0,0,.06)`, glyph `rgb(102,102,102)`, above a 14px grey hint (the "1–4 product images" hint, Vietnamese UI copy) | Circle 36×36 present |
| U4 | Thumbnails after upload | 6rem squares, 6px radius | Thumbnails inside the zone, radius 12px, remove button top-right | Upload of 2 images shows 2 thumbs inside the zone |

### 4. Controls

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| K1 | Labels | legend/label 600, mixed | 14px/21px weight 500, black, 6px above the control | Label computed 14px/500 |
| K2 | Native selects (preset, ratio, duration, store) | browser default | Custom select: height 39px, bg `rgb(242,242,242)`, radius 8px, 1px transparent border, padding 8px 10px, chevron right, 16px text; listbox popover with keyboard support | No native select chrome in screenshots; arrow-key selection test passes |
| K3 | Model picker | radio card with blue border | Same 39px grey select style showing model name, pass rate and estimate in the row/popover (keep the existing data) | Model control height 39px |
| K4 | Prompt box | plain textarea | Wrapper bg `rgb(242,242,242)`, 1px `rgb(230,230,230)`, radius 8px, padding 0 8px 8px; textarea 14px/21px, transparent, 75 px tall | Wrapper box 268×~122 |

### 5. Tabs

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| T1 | Underline tabs | 2px blue underline | Pill tabs: 37 px tall, padding 8px 20px, radius 8px, 14px/600; active bg black, text white; inactive text `rgb(102,102,102)`, no bg; no bottom border | Active tab computed bg `rgb(0,0,0)` |
| T2 | Tab placement (≥1024) | left-aligned above the side pane | Centred over the grid, top at y=24 | Tabs centred within ±4 px of the grid centre |
| T3 | Narrow tabs (<1024) | underline, full row | 4 equal pills in one row (here 3: Create / History / Examples), 30 px tall, padding 6px 4px, radius 8px, 12px/600, 2 px gaps; active black/white | Three equal-width pills at 390 |

### 6. Examples grid

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| G1 | Near-uniform grid | CSS columns `3 9rem`, gap .75rem, every fixture 9:16 | 3 flex columns, each 245 px at 1440 (container 752), 8px column gap and 8px row gap | 3 columns, 8 px gaps at 1440 |
| G2 | No height variety | all tiles the same ratio | Mixed ratios as on the reference: 16:9 (245×138), 1:1 (245×245), 3:4 (245×327), 9:16 (245×436). Generate fixtures in at least these four ratios | At least 3 distinct tile heights in the first 9 tiles |
| G3 | Tile shape | radius .75rem, title under the tile, chips | Wrapper radius 14px, overflow hidden, pointer cursor; title as an overlay or hover caption, not a text row under every tile; keep the sample and fixture chips small | Tile radius 14px; no caption row under tiles |
| G4 | Grid start | below the tabs inside the side area | Grid top at y=81 (tabs 24–61, 20 px gap), right padding 48 px | Grid top within ±6 px of 81 at 1440 |

### 7. Run button

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| R1 | Below the fold at 1440×1000 | Run sits after the form | Pinned at the card bottom (see C2): 272×56 px, 16 px above the card's bottom padding | Run visible at first paint at 1440×1000 and 1280×800 |
| R2 | Style | blue `#1d4ed8`, 6px radius | Black `rgb(0,0,0)`, white 16px/500, radius 8px, padding 12px 16px, full card width, content centred with a 12px gap; the cost estimate sits inside the button (e.g. "Create · $0.80" in the Vietnamese UI copy) | Computed bg `rgb(0,0,0)`, height 56 |

### 8. Narrow layout (390×844)

| # | Gap | Current | Target (measured) | Acceptance |
|---|---|---|---|---|
| N1 | Top bar | padding .5rem .75rem, border-bottom | 57 px tall, sticky, white, z-index above content, no border; menu button 40×40 radius 10px without a box border; title 18px/600 `rgb(26,26,26)` | Top bar height 57 |
| N2 | Duplicated Create page title | top bar title and page h1 | Top bar title only (see C4) | One Create page title at 390 |
| N3 | Card | full-width card | 358 px (16 px gutters), radius 8px, same shadow, padding 24px, tabs at y=73 | Card x=16, width 358 |
| N4 | Sticky Run bar | white bar with shadow and per-clip cost text | Black Run button 358×60, radius 8px, pinned to the bottom of the viewport (y≈772 at 844), no separate white bar; cost inside the button | Run button height 60 at 390 |

### Tests to update

- Re-record the screenshot baselines at 1440, 1280, 1024, 1023 and 390, then attach new side-by-sides for C4.
- Keep every playback, interaction and no-paid-call test from M.7.
- Add computed-style assertions for the "Acceptance" column (sizes ±2 px, colours exact).

### Not measured

- Hover, focus and open states of the select popovers, and the drawer motion on the reference: not captured in this read-only pass.
- Reference pages between 391 and 1439 px: not measured. The 1024 px rule from M.7 stays.

## Media: test fixtures versus demo media

- The striped fixture clips stay as the technical fixtures for the playback tests. They never appear in the screenshots the owner judges.
- The comparison screenshots use **demo media**: short motion clips made locally (for example ffmpeg pans and zooms) from company sample images (B.3) or other assets the company may use, in 16:9, 1:1, 3:4 and 9:16, labelled as samples in the UI and never presented as AI results. Company images stay outside Git: the demo clips are generated into a git-ignored folder and loaded from there, with the fixtures as fallback. No paid generation.
- If no demo media can be made, say so in the PR; never prove motion with a still image.
- Clip content differs from the reference on purpose and may be masked in comparisons; frame, ratio, crop, poster position and card spacing may not.

## Validation: overlays, not only side by side

1. Capture the app and the reference under the same conditions: CSS viewport, 100 % zoom, device scale factor, browser, fonts loaded, selected tab, scroll position. Viewports: 1440×1000, 1280×800 and 390×844, plus the 1023/1024 checks from M.7. A viewport not measured on the live page is reported as not measured.
2. For each region (shell, settings card, dropzone, controls, Run, tabs, grid) produce a side-by-side and a semi-transparent overlay of the same region, so edge and size drift is visible.
3. Masks are listed openly and cover only intended differences (logo, clip content, model names, prices, removed SaaS items), never a layout region that is still off. Vietnamese copy is checked for type and wrapping, not pixel identity.
4. Measured rows keep the ±2 px and exact-colour checks as e2e computed-style assertions. This is not a promise that every pixel matches, and no screen is hard-coded to one viewport.
5. Motion is tested separately and stays real: sources load, time and decoded frames advance, pause off-screen and in a hidden tab, reduced motion, blocked autoplay, broken source, carousel, drawer open and close.
6. On the M.7b head the owner of the worktree runs `pnpm typecheck`, `pnpm test` and the web e2e suite on the mock provider, and records the head SHA and the actual results.
7. Each round lists the gaps that remain, then fixes them. The PR shows, per row: target, measured result, overlay.

## Done (M.7b)

1. Every row above meets its acceptance check (computed-style e2e assertions, sizes within 2 px, colours exact), or the PR names the row with the reason it cannot be met.
2. The baselines are re-recorded with demo media at the viewports above, and the region overlays and side-by-sides are attached; the M.7 playback, responsive, interaction and no-paid-call tests stay green.
3. The conductor merges the PR after CI on the exact head, posts the evidence, notifies the owner and leaves M.7b in `doing`. It never runs `done` or `skip` on M.7b. If the step times out it becomes `stuck`, which still holds the deploy.
4. **C4 stays not met until the owner reviews the new revision on the same comparison page and accepts it.** Only then is M.7b recorded `done` (by the owner, or by the coordinating session on the owner's word, with the accepted revision as evidence). If the owner asks for another round, M.7b goes back to `pending` with the owner's notes.

CI green or a merged PR is never visual acceptance. Until the owner accepts, `docs/STATUS.md` says "UI and motion parity not met".
