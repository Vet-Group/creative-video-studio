# Provider balances

Owner decisions of 2026-11-03 and 2026-11-04: Vertex and BytePlus are the main providers and fal.ai is the fallback; Replicate was removed on 2026-11-04 once its
prepaid credit was spent (its panel row, Admin Settings credit field and hourly guard went with it). No provider has
an API to buy credit, so the app has no payment or top-up flow: Admin Costs shows each balance, marks a low one red and links to the
provider's own billing page, where the owner tops up by hand.

## The panel

Admin Costs has a provider balances panel, loaded on its own (`GET /api/admin/costs/balances`), so a failed read leaves the rest of the
page. One row per provider:

| Provider | Balance | Billing page |
|---|---|---|
| fal | Live from `GET https://api.fal.ai/v1/account/billing?expand=credits` with `Authorization: Key <FAL_KEY>` (`credits.current_balance` and `credits.currency`). 30 s timeout, answer bounded to 64 KiB; a good read is kept 1 minute in memory, a failed one is retried on the next open. Without `FAL_KEY` or on an HTTP error the row says why. | https://fal.ai/dashboard/billing |
| Vertex | Per account, the remaining credit and expiry the Vertex section already computes from the billing export ([vertex-accounts.md](vertex-accounts.md)); the panel reuses that answer and does not read Google again. | https://console.cloud.google.com/billing |
| BytePlus | No balance read: the row only links to the billing page (the app books each job's cost in the ledger as for the others). | https://console.byteplus.com/finance/overview |

A balance in USD under the Admin warning threshold (`settings.balance_warning_usd`, default 10 USD) shows red. A fal balance in
another currency, or an unknown balance, is never red.

## Admin Settings

Section provider balances:

- The balance warning threshold (USD): a balance under it shows red.
The threshold is validated as an amount of 0 or more with at most 4 decimals and audited as `settings.update` with the old and new values (migration 0051).

## fal credit lock (2026-11-05)

A fal model is locked while one Run of it would cost more than fal can still spend: fal's live USD balance minus the estimates of the fal jobs that
have not ended (`queued`, `submitting`, `running`), since fal bills a job when it ends (`apps/web/src/lib/provider-credit.ts`). The pickers show such a
model as not selectable with the credit left; `POST /api/jobs` refuses it with 429 under the caps lock, so two Runs cannot spend the same last dollars.
A good balance read is kept a minute, so a top-up unlocks the models within a minute. When the balance cannot be read or is not in USD, nothing is
locked and fal itself refuses a job it cannot pay for. Other providers are not locked: BytePlus bills the card, and a Vertex account stops through its
own credits guard.

## Replicate (removed 2026-11-04)

Replicate has no adapter any more: no code path submits to it, `REPLICATE_API_TOKEN` is no longer read, and the hourly Replicate guard and its fal twin
switching are gone. The `settings.replicate_credit_usd` and `replicate_credit_since` columns stay in the schema, unused. Migration 0062 turned off every
`replicate` row of `model_configs` and deleted the ones no job and no ledger row names; the rest stay, disabled, because `jobs.model` references
`model_configs.id` and the Costs and Library pages read old jobs. The settings API refuses to enable a model of a removed provider (`REMOVED_PROVIDERS`
in `apps/web/src/app/api/admin/settings/route.ts`), and Admin Settings shows such rows as switched off. Old `replicate` rows in the ledger and in
`provider_invoices` still show in Admin Costs; new Replicate invoices can no longer be entered.
