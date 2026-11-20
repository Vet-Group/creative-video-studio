# Billing teams

Status: accepted 2026-11-20 (owner decisions below). Built in two pull requests: setup and the store restriction first, then the attribution and the accounting view.

## Owner decisions (2026-11-20)

| Question | Decision |
|---|---|
| Billing teams | A sales team is a **billing team** (`teams.billable`). It gets a free allowance each month (`teams.free_monthly_usd`, 20 USD by default). Once the team's month total passes it, the excess is billed to the team; accounting reads it at month end. |
| Members and stores | A team holds members (`users.team_id`) and stores (`stores.team_id`). A platform (a marketplace such as an online craft market) is a store row like any other, so a platform team owns a platform store. |
| Partner workspaces | Every workspace other than the company's (`ws_vet`) is billed for all of its costs from the first dollar, with no allowance. Partner owners still see no USD (docs/WORKSPACES.md §3). |
| Start | Billing starts with month 2026-11 on `cost_entries.month`. Rows of earlier months stay recorded per user and store but are company cost, never team or partner cost. |
| Company cost | Shared rows with no user (invoice differences, manual adjustments, bake-off), rows of system accounts (`users.system`), and rows of users whose current team is not a billing team. |
| Attribution | A billing-team member's row goes to the team of the row's store when that store belongs to a billing team, otherwise to the member's current team (so LLM rows and store-less jobs go to the member's team). The current team and store mapping is used, so this month's costs follow today's teams. |
| Store restriction | A member of a billing team, an Admin too, may create jobs only for their team's stores, and their store picker lists only those. Not choosing a store stays allowed. Users outside billing teams keep every open store. The Admin "reassign store" tool stays unrestricted. |
| Caps | The allowance never blocks a Run: it is billing only. The per-user caps (docs/PROVIDERS-AND-CAPS.md) are unchanged. |

## Setup

- Migration 0111 adds `teams.billable` (false), `teams.free_monthly_usd` (numeric, 20, never negative), `stores.team_id` (set null when the team goes) and `billing_month_closes`. It changes no data: an Admin marks the real teams after the deploy.
- **Admin > Teams**: per team, a "sales team (billed)" checkbox, the free allowance in USD, and the team's stores (the company's stores; picking a store of another team moves it). `PATCH /api/admin/teams/:id` takes `billable`, `freeMonthlyUsd` (a non-negative amount with at most 4 decimals) and `storeIds` (the whole set); each change is audited (`team.billing`, `team.stores`).
- **Admin > Stores**: in the company workspace each store has a team picker. `PATCH /api/admin/stores/:id` takes `teamId` (a team id or null), audited `store.team`; a partner workspace's store never gets a team.

## The store restriction

One SQL predicate, `storeAllowed` in `apps/web/src/lib/billing.ts`, decides which stores a user may run for: any store, unless the user's team is billable and the store is a company store of another team or of none. Every path that sets a job's store uses it:

| Path | What happens to another team's store |
|---|---|
| `GET /api/stores` (every store picker) | Left out. |
| `POST /api/jobs`, a new Run | Refused: 403 with `code: "store_not_in_team"`; the forms show it in Vietnamese (`lib/api.ts` `errorText`). |
| `POST /api/jobs` with `retryOf` or `rerunOf` | The store is **dropped**: the job runs with no store, as a rerun already drops a store hidden since. Refusing would block a member's own retry for a mapping change they did not make; dropping keeps the run and bills it to the member's own team. |
| `GET /api/jobs/:id` (Reuse) | `storeId` is null and `storeLost` true, so the form leaves the store empty and says why. |
| `PUT /api/admin/jobs/:id/store` | Unrestricted (Admin tool). |

The Admin user editor lists stores from `/api/admin/stores`, so an Admin in a billing team still assigns any store to a user.
