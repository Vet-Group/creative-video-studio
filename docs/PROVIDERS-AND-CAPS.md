# Providers and caps for the image and apps features

Owner decision, 2026-10-24: the dashboard grows beyond video (Try On, Image Generation, nine apps). This file records the providers, the price per run and the caps. Prices were read from the fal.ai model pages on 2026-10-24 (`publicEndpointBilling` and each page's pricing section); they change, so the ledger always books the provider's real cost, never these numbers.

Video (Create Videos and Marketing Studio) keeps its own budget, `settings.monthly_cap_usd`, and the daily clip cap. Nothing here changes it.

## Providers

Every image and app feature runs on fal.ai: one key, one invoice, and the `fal` adapter already exists. Google's Gemini API direct is cheaper for Nano Banana Pro ($0.134 against $0.15) and is worth adding only once that model alone passes about $100 a month. Media Optimizer runs on our own server (ffmpeg and sharp) and costs nothing.

| Feature | fal endpoint | Price per run (2026-10-24) |
|---|---|---|
| Try On | `fal-ai/nano-banana-pro/edit` (default); `google/nano-banana-2.1/edit`; `fal-ai/fashn/tryon/v1.6` | $0.15; ~$0.044 (tokens); $0.075 |
| Image Generation | Nano Banana Pro, Nano Banana 2.1, Nano Banana 2, Nano Banana, GPT Image 2, GPT Image 2.5 Flare and Sunburst, Seedream 5.0 Pro | $0.04 to $0.30 by model and size; GPT Image is billed in tokens |
| Character Swap, Model Swap | `fal-ai/nano-banana-pro/edit` | $0.15 |
| Background Changer | `fal-ai/bria/background/replace` | $0.04 |
| Reframe | `fal-ai/ideogram/v3/reframe` (fallback `fal-ai/bria/expand`, $0.04) | $0.03 |
| Image Upscale | `fal-ai/topaz/upscale/image` | $0.01 per megapixel (4K about $0.08) |
| Face Swap | `easel-ai/advanced-face-swap` | $0.05 |
| Background Remover | `fal-ai/bria/background/remove` | $0.018 |
| Motion Control | `fal-ai/kling-video/v3/standard/motion-control` | $0.126 per second |
| Media Optimizer | local | $0 |

## Caps

Assumed use for 30 staff (6 heavy, 12 medium, 12 light users) was simulated over 20,000 months. The mean is $194 a month, p95 $235, p99 $256. At 120% of that use, 16% of months would reach $260; at 150%, 82%. The caps are starting points: review them after the first real month.

| Cap | Default | Kind |
|---|---|---|
| Image and apps month, all members (`settings.features_monthly_cap_usd`) | $260 | refuses a Run |
| Each member's ICT day (`settings.member_daily_usd_cap`) | $10 | refuses a Run |
| Each member's ICT month (`settings.member_monthly_usd_cap`) | $50 | refuses a Run |
| Per feature (`feature_caps`): Try On 45, Image Generation 135, Character Swap 10, Model Swap 20, Background Changer 10, Reframe 5, Image Upscale 15, Face Swap 5, Background Remover 10, Motion Control 40 | each feature's simulated p95, rounded up to $5 | warns the Admin on the Costs page from 80%; never refuses |

The per-feature caps only warn, because hard caps at p95 for ten features would block one feature or another in about 18% of months even at the assumed use.

The hard caps are checked in `packages/core/src/limits.ts` (`checkCaps` with the job's `feature`), in the same transaction and advisory lock as the job insert. The image and apps budget sums the ledger rows of jobs whose `feature` is not `video` or `marketing`. Shared rows (bake-off, adjustments, invoice differences) stay in the video budget. Admins change every cap on the Settings page; each change is audited.

## Image models and jobs (migration 0007)

`model_configs` has a `kind` (`video` or `image`), the `features` a model may serve, and, for an image model, `image_prices` (resolution label to USD per image) instead of `usd_per_second` and durations. Migration 0007 seeds seven fal image models **disabled**; an Admin switches them on in Settings (the database refuses an image model without prices, a limit and a ratio). Their ratios and request fields come from each endpoint's fal OpenAPI schema (`sources` records the URL and the read date); the prices are the ones in the table above, per image. Where a schema has no resolution input (Nano Banana, GPT Image 2, FASHN) the only price label is `1K` and nothing is sent; Seedream takes `auto_1K`/`auto_2K` or a computed size.

An image job (`POST /api/jobs` with `feature` other than `video` or `marketing`) stores `duration_s = 0` and `params` (`resolution`, optional `quality`, which only GPT Image reads and which defaults to the `high` tier its price assumes). Its estimate is `image_prices[resolution]`, booked at Run and settled to the larger of that and the reported cost, like a video. Try On needs the person image first and at least one garment image, and may omit the prompt: the API then stores a fixed English default, so the row shows what was sent.
