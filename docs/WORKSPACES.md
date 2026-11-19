# Workspaces (multi-tenant)

Status: accepted 2026-11-19 (owner decisions below), revised the same day after an adversarial review. Built in phases, each merged and deployed on its own.

The design follows POD Studio's ADR 0006 (workspaces, expand → backfill → code switch → contract), which already runs in production for the company's design tool, so both products share one model of who sees what.

## Context

Every signed-in CVS user belongs to one company. The Library, Examples, company templates and hooks, shared AI models, shared Smart Remake analyses, stores, the Feedback board and Explore's best clips are shared by every member, and `readableAsset` lets a member read any input of any live clip. External partner sellers must now use CVS without seeing any of the company's data, and without the company's members seeing theirs.

## Owner decisions (2026-11-19)

| Question | Decision |
|---|---|
| Model | Several workspaces; a user may belong to more than one and switches between them. |
| AI costs | The company pays, on its own provider accounts, with no separate cap per workspace. Partners share the company's caps. |
| What a partner sees | Only what holds no company data: models, apps, built-in prompt presets and hooks, the fixed samples, guides, What's new. Not: company Examples, Library, company templates/hooks, company stores, shared AI models, costs (spend, balances, credit), the company's feedback. |
| Members | A workspace owner invites and removes the members of their workspace; a global Admin can do the same for any workspace. |
| Admin access to content | A global Admin manages workspaces (create, disable, members, counts, costs) but sees a workspace's content only as one of its members. |
| Rollout | Phase by phase, each merged and deployed; a database backup before each migration. |

One exception, recorded for the owner to overturn: feedback items and app ratings are messages to the company that runs CVS, so the Admin triage list and ratings list show them from every workspace, labelled with the workspace's name. A partner's members see only their own workspace's board.

## Decision

### 1. Tables

| Table | Columns |
|---|---|
| `workspaces` | `id` text, `name` (unique on `lower(name)`), `created_by` → `users` (set null), `created_at`, `disabled_at` (null = active) |
| `workspace_members` | `workspace_id` → `workspaces` (cascade), `user_id` → `users` (cascade), `role` (`owner` / `member`, checked), `added_by` → `users` (set null), `created_at`; primary key `(workspace_id, user_id)`, index `user_id` |

The company's workspace has the fixed id `ws_vet`. A workspace always keeps at least one owner. A disabled workspace refuses every request of its members (they see a notice); its data stays.

These are our own tables, not better-auth's `organization` plugin: the plugin adds organization, invitation and role endpoints under `/api/auth/organization/*` that would all need closing, and POD Studio already runs this shape.

### 2. Which rows carry `workspace_id`

Root rows carry it; children are reached through their parent.

| Table | `workspace_id` | Notes |
|---|---|---|
| `jobs`, `assets`, `analyses`, `remakes`, `suggestion_runs` | NOT NULL, FK | A worker output takes its job's (or remake's) workspace. |
| `user_templates`, `user_choices` | NOT NULL, FK | "Company" templates and hooks (`is_company`) become the workspace's. |
| `fashion_models` | NOT NULL, FK | `shared` means shared inside the workspace. |
| `stores` | NOT NULL, FK | A store belongs to one workspace; `user_stores`, brand kits and store-scoped templates follow it. An Admin creates a partner's stores in its workspace. |
| `feedback` | NOT NULL, FK | Each workspace has its own board (see the exception above). |
| `preset_proposals` | NOT NULL, FK | Proposing to the shared preset catalog is company-only: refused outside `ws_vet`. |
| `cost_entries` | NOT NULL, FK | The ledger is append-only (an update trigger refuses changes), so the column arrives with its constant default and is never updated: shared and invoice rows stay `ws_vet` (the company pays them), new rows copy their parent's workspace. |
| `examples`, `favorites`, `verdicts`, `ratings`, `feedback_*`, `audit_entries` | via parent / none | Reached through their job, user or feedback item; the audit log stays Admin-only and instance-wide. |
| `presets`, `model_configs`, `feature_caps`, `settings`, `monthly_rates`, `provider_invoices`, `vertex_accounts`, `worker_heartbeat`, `teams` | none | Instance-wide catalog and operations. `teams` stays the company's cost-centre label; a partner's users keep the unassigned team. |
| `users`, `accounts`, `sessions`, `passkeys`, `two_factors`, `verifications` | none | Identity is instance-wide; membership grants data. |

### 3. The access rule

- **One resolver.** `guard()` and `currentUser()` (server-rendered pages) call the same helper, which returns `{ userId, role, workspaceId, workspaceRole }`: the workspace named by the `cvs_ws` cookie if the user is an active member of it, otherwise the user's oldest active membership. A user with no active membership gets `403 no_workspace` from every data route and a notice page.
- **Per tab.** The cookie is per browser, so the client also sends the workspace it rendered with (`x-cvs-workspace`); a write whose header differs from the resolved workspace answers `409 workspace_changed` and the page offers a reload. Retry and rerun keep the original job's workspace.
- **Every row, including your own.** Every read and every reference of a workspace table filters on `workspace_id = $workspace` in the same statement that resolves the id the client sent, also when the row is the caller's own (a user in two workspaces must not carry an upload, a store, a template or a job from one into the other). An id of another workspace answers `404`, never `403`, so existence does not leak.
- **Inserts.** Every insert writes `workspace_id` explicitly; the worker copies it from the parent row. The column defaults are dropped one deploy after the code switch, so an insert that forgets then fails instead of filing a partner's row under the company (dropping them in the same deploy would break the old processes still running between the migration and the restart).
- **Dedupe** partitions by `(owner_id, workspace_id, sha256)`: the upload dedupe (`keptInputs`) and the worker's sweep.
- **Global Admin** (`users.role = 'admin'`): creates and disables workspaces, manages any workspace's members, and reads usage numbers per workspace (counts, costs, member names). Content screens (Library, a job by id, an asset) follow the same rule as anyone's. Admin-only extras that read content (any job, any asset, any analysis, private AI models) apply inside the active workspace only. An Admin adding themselves to a workspace is audited and shown on the workspace's Members page.
- **Workspace owner**: adds and removes the workspace's members and changes their roles, and renames it. The last owner cannot be removed or demoted.
- **Editor** (`can_edit_templates`) and the shared catalog (presets, samples) stay company-only: the flag is honoured only in `ws_vet`.
- **Impersonation**: allowed only for a user who shares a workspace with the Admin, and on every request of an impersonated session the active workspace must be one they share.
- **Costs**: the fal balance and spend figures (`creditUsd` on `/api/models` and `/api/image-models`, the cost of a Library clip) are not sent outside `ws_vet`.
- Aggregate numbers that carry no content stay instance-wide: queue length, model pass rates, the company caps.

### 4. Accounts and sign-in

- Lark sign-in is gated to the company's tenant. A user Lark creates joins `ws_vet`; the membership is added in the Lark provisioning path, not in a generic `user.create` hook (an Admin-created partner user passes through that hook too).
- Email + password sign-up stays closed. A workspace owner adds an existing user by email, or creates an account with a temporary password (`mustChangePassword`) shown once to copy to the person; CVS sends no email. Owners may not create accounts for addresses on the company's email domains (`CVS_COMPANY_EMAIL_DOMAINS`, `vetgroup.net` when unset; a member outside `ws_vet` cannot change their own email to one either), and Lark never links a sign-in into an account an owner created (it is created unverified, and its `workspace.account_create` audit row with `byOwner` makes the account hooks refuse a Lark link), so a partner cannot pre-create a staff member's account.
- An Admin creates accounts in the workspace they pick (`ws_vet` by default). Google sign-in (sign-up closed) then works for the same address.

### 5. Phases

| Phase | What | Visible change |
|---|---|---|
| 1. Expand + backfill | Migration only (plus `schema.ts` and its snapshot): the two tables; `ws_vet` "VET Group"; every user a member (Admin → owner, others → member); `workspace_id` on the tables of §2, filled by a constant default `ws_vet`; indexes for the list queries; `SET LOCAL lock_timeout`. | None |
| 2. Code switch | The resolver in `guard()`/`currentUser()`; every path of the appendix scoped, own rows included; inserts write `workspace_id`; worker outputs and ledger rows inherit it; dedupe per workspace; the `x-cvs-workspace` check; impersonation and cost rules; memberships for users created after phase 1. An isolation e2e suite with a company user, a partner user and a user in both asserts nothing crosses in either direction. | None for company users |
| 2b. Contract | Drop the `workspace_id` defaults (a deploy after phase 2). | None |
| 3. Management | Admin: Workspaces page (create with an owner, disable, members, counts and monthly cost). Owner: Members page. A workspace switcher in the shell when a user has two or more. Company-only surfaces hidden in a partner workspace (Lark reminder, team, editor tools, costs). | New pages |

Migrations are forward-only and drizzle skips a migration older than the last applied one, so a migration branch is regenerated on top of any migration merged before it. Before each deploy that migrates, take a backup (`scripts/run/vet.sh backup`); rollback is restoring it and deploying the previous commit.

## Red team

| Risk | Answer |
|---|---|
| A query missed in phase 2 leaks company data | The appendix lists every path found on 2026-11-19; the phase 2 PR checks each one off, and the isolation e2e reads every list, every by-id route and every copy path as the other workspace and as a user in both. |
| A user in two workspaces carries rows across | The rule covers the caller's own rows; the e2e's two-workspace user tries each reference path. |
| A stale tab files a partner's run under the company | The `x-cvs-workspace` header check. |
| An insert missed in phase 2 files a partner row under the company | Phase 2b drops the defaults; the e2e asserts every row the partner creates is in the partner workspace. |
| A forged `cvs_ws` cookie | It only selects among the user's own active memberships; anything else falls back. |
| A partner exhausts the company's budget | Accepted by the owner (shared caps); the Admin cost screens show spend per workspace. |
| An Admin reads partner content through Admin screens or impersonation | Content-bearing Admin extras apply inside the active workspace only; impersonation is checked on every request. |
| A partner owner pre-creates a staff member's account | Company email domains refused; Lark refuses to link into owner-created accounts. |
| Explore's best clips or Examples show another workspace's media | Both read the active workspace only (server-rendered pages use the same resolver). |
| The migration locks or fails on the append-only ledger | Postgres 16 adds a constant-default column without a rewrite and fires no row trigger; nothing updates `cost_entries`; `lock_timeout` bounds the wait. |

## Appendix: paths to scope in phase 2 (audit of 2026-11-19, main `b16c87d0`)

Paths are under `apps/web/src`; line numbers drift, search by name.

Cross-user reads:
- Assets: `lib/assets.ts` `readableAsset` (owner short-circuit, Admin bypass, inputs of live clips, company/store choice photos, shared AI models, shared analysis videos), used by `/api/assets/[id]`, `/content`, `/download`, `/thumb`, `/compress`, and by analyses, remakes and suggestions.
- Job inputs: `/api/jobs` POST accepts any input of a succeeded job or a shared AI model.
- Library: `/api/library` (list, creators, stores, ratios, unmarked count, `example=1`, clip cost), `/api/library/zip`.
- Jobs: `/api/jobs/[id]` GET (any succeeded job, Admin any job), DELETE, `/favorite`, `/verdict`, `/example`; `lib/clips.ts` (Explore best clips, download names); `lib/model-scores.ts` (numbers only, stays global).
- Explore: `app/(app)/explore/page.tsx` hero strip from examples, `continueJobs`.
- Templates: `/api/templates` (company + store templates), `/api/templates/[id]` (opens any company or store template and copies the author's photos into the viewer's assets).
- Choices: `/api/choices` (company + every store's), `lib/choices.ts`, `/api/choices/[id]` (editor).
- AI models: `lib/fashion-models.ts` (shared, or all for an Admin), `/api/fashion-models/[id]`.
- Analyses and remakes: `/api/analyses` (`?shared=1`, `?scope=all`), `/api/analyses/[id]`, `/api/analyses/[id]/share`, `/api/remakes` (remake from a shared analysis; spend of queued remakes), `/api/suggestions` (scene pick on a shared analysis), the worker's remake reading the shared analysis.
- Feedback: `/api/feedback`, `/api/feedback/[id]` (+ comments, vote), `lib/feedback.ts` (board, unread badge), the layout's Admin badge, `/api/admin/feedback`, `/api/admin/ratings`.
- Stores: `/api/stores`, `/api/stores/[id]` (brand kit), `/api/stores/[id]/pin`; the store check on `/api/jobs` POST (brand kit into the prompt), `/api/assets` POST and `/api/admin/jobs/[id]/store`.
- Presets: `/api/preset-proposals` (editor queue).
- Costs: `/api/models` and `/api/image-models` (`creditUsd`), Library clip cost.
- Admin: `lib/overview.ts`, `lib/report.ts`, `lib/costs.ts`, `/api/admin/*` (group or label by workspace; no partner content).

The caller's own rows (each must also match the active workspace):
- Uploads picker `/api/assets` GET, `keptInputs` (`packages/db/src/assets.ts`), `/api/assets/copy`, `/api/assets/finalize-video`, `/api/assets/samples`.
- `/api/jobs` POST end-frame, audio and video checks, retry and rerun; `/api/jobs` GET (History).
- `/api/recall`, `/api/recent-prompts`, `/api/templates` (own), `/api/choices` (own), `/api/fashion-models` (own), `/api/analyses` (own), `/api/remakes` (own), `/api/suggestions/[id]`, `/api/feedback` POST (photos), `/api/rating`.

Worker and core (`apps/worker/src`, `packages/core/src`):
- Output and poster assets (`worker.ts`), previews (`preview.ts`), remake outputs (`remake.ts`) take the parent's workspace.
- Ledger rows (`ledger.ts` `append`, `bookLlm`) copy the parent's workspace; `bookShared` and `bookInvoice` write `ws_vet`.
- The asset dedupe sweep (`asset-dedupe.ts`) partitions by workspace.
