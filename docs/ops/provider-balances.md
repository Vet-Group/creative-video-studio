# Provider balances

Owner decision of 2026-11-03: fal.ai and Vertex are the main providers; Replicate is dropped once its prepaid credit is spent. No provider has
an API to buy credit, so the app has no payment or top-up flow: Admin Costs shows each balance, marks a low one red and links to the
provider's own billing page, where the owner tops up by hand.

## The panel

Admin Costs has a provider balances panel, loaded on its own (`GET /api/admin/costs/balances`), so a failed read leaves the rest of the
page. One row per provider:

| Provider | Balance | Billing page |
|---|---|---|
| fal | Live from `GET https://api.fal.ai/v1/account/billing?expand=credits` with `Authorization: Key <FAL_KEY>` (`credits.current_balance` and `credits.currency`). 30 s timeout, answer bounded to 64 KiB; a good read is kept 1 minute in memory, a failed one is retried on the next open. Without `FAL_KEY` or on an HTTP error the row says why. | https://fal.ai/dashboard/billing |
| Vertex | Per account, the remaining credit and expiry the Vertex section already computes from the billing export ([vertex-accounts.md](vertex-accounts.md)); the panel reuses that answer and does not read Google again. | https://console.cloud.google.com/billing |
| Replicate | Replicate has no balance API (`/v1/account/billing` answers 404). Remaining = the balance the Admin entered minus the `replicate` spending of the credit period in the ledger (`cost_entries`): every row of a job created after the balance was entered (holds of jobs in flight included) and the rows without a job (bake-off, manual) booked after it. A job sent before belongs to the old balance even when it is released or settled later, and `invoice_diff` rows are left out, so entering a past month's Replicate invoice never eats into the balance. | https://replicate.com/account/billing |

A balance in USD under the Admin warning threshold (`settings.balance_warning_usd`, default 10 USD) shows red. A fal balance in
another currency, or an unknown balance, is never red.

## Admin Settings

Section provider balances:

- The balance warning threshold (USD): a balance under it shows red.
- The current Replicate balance (USD), read from Replicate's billing page. Saving a new amount stores it in `settings.replicate_credit_usd`
  and restarts the count from that moment (`settings.replicate_credit_since`); saving the same amount keeps the old start unless the
  "count again from now" box is ticked (`replicateCreditRecount: true`), which restarts it with the amount unchanged, for a top-up that leaves
  the balance reading the same figure again. An empty field clears both, which turns the Replicate guard off. After a top-up, enter the
  balance Replicate shows then.

Both are validated as amounts of 0 or more with at most 4 decimals and audited as `settings.update` with the old and new values (migration 0051);
a recount is audited the same way, with the new start.

## Replicate guard

The worker runs the guard at start-up and every hour, inside the worker process next to the Vertex tick (no unit of its own). It reads the
balance inside its transaction after locking the settings row, so it never acts on a balance an Admin is changing. When a balance was entered
and less than 2 USD of it remains, it turns off every enabled model with provider `replicate` and turns on its fal twin, in one
transaction, each change audited as `model.set_enabled` with no actor (the system) and the remaining USD. The twins are a map in
`apps/worker/src/replicate-guard.ts`, since no column links the rows:

| Replicate model | fal twin |
|---|---|
| `seedance-2.0-replicate` | `seedance-2.0-reference` (the row it was copied from, migration 0033) |
| `seedance-2.5` | `seedance-2.5-reference` (4 reference images on both) |
| `veo-3.1-replicate` | `veo-3.1` (the row it was copied from, migration 0040) |

Because the check runs only hourly, jobs sent within the hour can spend past the 2 USD mark: enter the balance with some headroom, or
expect the last hour's jobs to be refused by Replicate once it is empty.

A twin is enabled only when the worker has `FAL_KEY`; without it the Replicate models are still turned off and the worker logs that no twin
was enabled. A twin already on is left alone; a twin the database refuses to enable (no recorded limits or price) is logged and left off. Once every
Replicate model is off the guard changes nothing more, so it acts once. It never touches fal or Vertex rows. If an Admin turns a Replicate
model back on while the credit is still under 2 USD, the next hourly pass turns it off again; enter the new balance after a top-up first.
Without an entered credit the guard does nothing.
