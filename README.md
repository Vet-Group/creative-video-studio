# Creative Video Studio

An internal web app for company staff to turn product mockups and photos into short product videos.
It is developed and run independently; the Fash Studio capture in `dev/work/fash-internal` is a read-only UI reference,
never a runtime dependency.

- Product and decisions: [`docs/PRD.md`](docs/PRD.md), [`docs/STATUS.md`](docs/STATUS.md).
- Design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Milestones: [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).
- Scope: the internal creative dashboard: Explore, Try On, Image Generation, Create Videos, Marketing Studio, Apps and Library. No pricing, subscriptions or billing; real USD cost is shown instead.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js app: UI and route handlers, better-auth |
| `apps/worker` | pg-boss consumer: submits jobs to the video providers and copies the output (skeleton until M.2) |
| `packages/core` | Shared contracts: model config, provider adapter interface, presets |
| `packages/db` | Drizzle schema, migrations, test database helper |
| `scripts` | Preflight, the autonomous-run harness (`scripts/run`), repository checks |
| `deploy/linux` | Server-side scripts for the VET host (`install.sh`, `uninstall.sh`, backups; see `docs/ops/deploy.md`) |

## Development

```sh
pnpm install
cp .env.example .env        # local values; never commit .env
pnpm services:up            # Postgres on 5435, MinIO on 9400/9401
pnpm typecheck && pnpm test
node scripts/check-english.mjs
```

## Autonomous run

The delivery plan runs end to end after one owner preflight and one pre-approval sentence. Owner steps are in
`docs/ops/PREFLIGHT.md` (local only). In short: fill `.env`, run `pnpm preflight`, then `pnpm run:approve "<sentence>"`.
The harness in `scripts/run` keeps the run manifest, enforces the hard stops in code and verifies evidence with
`pnpm run:verify`.
