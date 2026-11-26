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

## Attribution

`billedRows(month)` in `apps/web/src/lib/billing.ts` is the one SQL source of truth: every reader (the accounting view, its CSV, a month close and the member's panel) selects from it. It gives each ledger row of the month one bucket, testing in this order:

```sql
case
  when ce.month < '2026-11'          then 'company:before_start'
  when ce.workspace_id <> 'ws_vet'   then 'partner:' || ce.workspace_id
  when ce.user_id is null            then 'company:shared'
  when bu.system                     then 'company:system'
  when not but.billable              then 'company:non_billing'
  when bst.billable                  then 'team:' || bst.id   -- the store's team
  else                                    'team:' || but.id   -- the member's team
end
-- bu = the row's user now, but = that user's team now, bst = the team of the row's store now
```

`cost_entries.team_id` (the team when the row was booked) is not read: the owner chose today's mapping. Each row lands in exactly one bucket, so the teams, the partners and the company always add up to the month's ledger; the view sums the unrounded `numeric` amounts in whole 1/10000 USD and shows an "in balance" check when they match and an "out of balance" one when not. A team's payable is `max(0, total − free allowance)`; a partner's payable is its total. Amounts are rounded only for display; the CSV carries the exact 4 decimals.

## Accounting view

**Admin > Costs > By team** (`/admin/costs/teams`, `GET /api/admin/billing?month=`), default this ICT month:

- the ledger total, what the teams pay, what the partners pay and the company's cost;
- each billing team: members, stores, total, the allowance bar (neutral below 75%, a warning from 75%, the part past the allowance as its own segment labelled "billed to the team", with the amounts in words beside it), payable, and its rows by user, store and model;
- each partner workspace (total = payable) and the company's cost by reason (before 2026-11, shared rows, system accounts, non-billing teams), each opening its rows.

CSV (`GET /api/admin/billing/csv?month=`): one line per (month, bucket, team or partner, user, store, kind, USD); `&part=summary` gives one line per team, partner and company reason with its total, free allowance and payable, and the ledger's total.

**Closing a month.** An open month follows today's teams and stores. Once accounting has read a past month, an Admin closes it ("Close month", `POST /api/admin/billing/close`, audited `billing.close`): its buckets, lines and totals are stored in `billing_month_closes` with the ledger id they include, and the view and the CSV read that snapshot and say when it was closed. A row booked later in that month or a later team change does not move it. An Admin may reopen it (`DELETE /api/admin/billing/close?month=`, audited `billing.reopen`); this month cannot be closed.

**The automatic close** (owner decision 2026-11-26). With `BILLING_AUTO_CLOSE=1` in the production web server's environment, `apps/web/src/instrumentation.ts` runs `autoCloseLastMonth` (`apps/web/src/lib/billing.ts`) a minute after start and then every hour. From 08:00 ICT on day 1 it closes the previous ICT month with `closeMonth(month, null)` (no actor: the page shows an automatic close and the audit log shows the system) and, once that commits, sends the close mail below. If the server was down at 08:00 it closes later in the month. It does nothing for a month before `BILLING_START_MONTH`, and nothing for a month that has ever been closed (any `billing.close` audit row for it): **a month an Admin reopened stays open until an Admin closes it again by hand**. The first one is November 2026, on 2026-12-01 at 08:00 ICT. Without the flag (tests, the e2e server, dev) nothing runs.

**The close mail** (owner decision 2026-11-20). Once a close has committed, `mailClose` in `apps/web/src/lib/billing.ts` sends the people in `FAL_ALERT_LARK_TO` (the same list as the fal alert, parsed by `larkRecipients` in `packages/core/src/lark.ts`), as the CVS Lark app's bot, a short Vietnamese summary (month, ledger total, what the teams pay, what the partners pay, the company's share) and the month's CSV (`/api/admin/billing/csv`, same content) as a file named `cvs-chi-phi-YYYY-MM.csv`. It is best effort: the close stays committed whatever Lark does, the response carries `lark: { sent, failed } | 'off'`, and the page shows one line so an Admin can send the CSV by hand. It is `off` without `LARK_APP_ID`, `LARK_APP_SECRET` or any recipient. The outcome is audited as `billing.send`. Reopening and closing again sends again.

## The member's panel

`GET /api/me/limits` adds `team: { name, monthUsd, freeUsd, payableUsd, provisional }` for a member of a billing team acting in the company workspace: their own team's month so far by the same attribution. The Limits section of Settings shows it with the same bar. Members of other teams and every partner workspace get nothing new; partner owners still see no USD. The allowance never blocks a Run.

**The month-end forecast** (open month only, never a past or closed month): a linear run-rate, `month total / elapsed × month length`, on ICT time with at least one day counted as elapsed (`apps/web/src/lib/forecast.ts`). `GET /api/admin/billing` carries `forecast: { ledgerUsd, teams: { <teamId>: usd } } | null`, and `team.forecastUsd` joins the member's panel; the allowance bar shows a forecast line labelled as an estimate and, past the allowance, what it would bill the team. It is display only: nothing is sent and nothing is blocked, and a partner workspace sees no USD.
