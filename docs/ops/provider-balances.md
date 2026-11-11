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
| BytePlus | The row links to the billing page (the app books each job's cost in the ledger as for the others). A second row, the Seedance 2.0 pack, shows the prepaid resource pack (see below). | https://console.byteplus.com/finance/overview |

A balance in USD under the Admin warning threshold (`settings.balance_warning_usd`, default 10 USD) shows red. A fal balance in
another currency, or an unknown balance, is never red.

## BytePlus Seedance 2.0 resource pack (2026-11-06)

BytePlus has no working API for a pack's remaining amount on the international site (`ListResourcePackages` and `ListPackageUsageDetails` answer HTTP 500, checked
2026-11-06), and no BytePlus billing key goes to the server, so the app computes it. The pack covers only `seedance-2.0-byteplus` (endpoint `dreamina-seedance-2-0-260128`);
2.0 fast, 2.0 mini and 2.5 are pay-as-you-go. Remaining tokens = the tokens the Admin entered as left at a moment (`settings.byteplus_pack_tokens` at `byteplus_pack_as_of`)
minus the sum of `jobs.provider_tokens` of that model's jobs with `finished_at` after that moment, read live on each open of the panel, never under 0.

- `jobs.provider_tokens` is BytePlus's `usage.completion_tokens`, which the adapter returns with a succeeded task and the worker stores when it settles the job (`settle`, also a
  clip we reject as below 720p, which BytePlus billed) or late-bills it (`lateBill`). A job without the count (an answer with no usage) subtracts nothing. A late-billed job is cut off
  by its `finished_at`, which is its timeout moment, so one that finished at BytePlus just after the as-of moment can be off by its own tokens.
- Migration 0076 seeds the pack read from the BytePlus bill on 2026-11-06 about 09:50 +07:00: 7 x "Dreamina_Seedance_2.0_pack_1000ktokens" = 7,000,000 tokens (`byteplus_pack_total_tokens`)
  bought 2026-11-04, 6,891,100 left as of 2026-11-06T02:50:00Z (108,900 deducted by one canary run outside CVS), expiring 2027-02-01T15:59:59Z (23:59:59 +08:00).
- The panel line shows tokens left of the total, the percent, about how many USD at $7 per million tokens, and the expiry day. It is red under 20% of the tokens or within
  14 days of the expiry.
- To enter a new pack, `PUT /api/admin/settings` with `byteplusPack: { totalTokens, tokens, asOf?, expiresAt }`: whole tokens, `tokens` from 0 to the total, `asOf` and `expiresAt`
  UTC `YYYY-MM-DDTHH:MM:SSZ` (`asOf` defaults to now and cannot be in the future, the expiry must be after it). Audited as `settings.update` with the old and new pack. There is no
  form for it in Admin Settings yet.

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

## fal low-balance alert (2026-11-10)

Owner decision of 2026-11-10: tell the Admins when fal's balance goes under the warning threshold, in the app and on Lark, so it is topped up before
models lock. There is still no top-up in the app: fal has no API to buy credit.

- **In the app.** Every page an Admin opens shows a notice under the top bar with the balance, the threshold and a link to fal's billing page
  (`apps/web/src/components/FalLowNotice.tsx`). It reads the panel's answer (`GET /api/admin/costs/balances`) once when the app loads; a failed read shows
  nothing. Members never see it.
- **On Lark.** The worker checks once an hour (`apps/worker/src/fal-alert.ts`), only when `FAL_KEY`, `LARK_APP_ID` and `LARK_APP_SECRET` are set. The
  first check under the threshold claims `settings.fal_low_alerted_at` (migration 0083) and sends one text message from the CVS Lark app's bot to every
  Admin who is not banned and has a linked Lark account (`accounts.account_id` is the Lark open_id for this app). Later checks while it stays low send
  nothing; a check at or over the threshold clears the claim, so the next drop alerts again. When every message fails the claim is released and the next
  hour tries again; the worker log has Lark's error code. A balance that cannot be read, or is not in USD, changes nothing.
- **Lark setup (owner, once).** In the Lark Developer Console, the CVS app (the one in `LARK_APP_ID`) needs the Bot feature and the scope
  `im:message:send_as_bot`, published in a new version that the tenant Admin approves, with the Admins inside the app's availability. Without the bot
  Lark answers code 11205 ("app do not have bot", checked 2026-11-10). An Admin who has never signed in with Lark gets no message.

## fal team account switch (2026-11-11)

Owner decision of 2026-11-11: the fal personal account is used up first, then CVS moves to the fal team "VET Group" (its Billing role lets the
accountant top up without the owner's GitHub login). fal cannot move credit between accounts, so the team is topped up and given its own key ahead.

- **Setup.** Put the team key in `FAL_KEY_NEXT` next to `FAL_KEY` in the server `.env` and restart the web app and the worker. Without it nothing changes.
- **Switch.** New fal jobs keep going to `FAL_KEY` until a submit there fails while its balance is under the Admin warning threshold. The first worker
  to see that sets `settings.fal_next_at`, writes a `fal.switch` audit row (no actor) and messages the Admins on Lark; the job is sent again to the team,
  and every later one goes there (`apps/worker/src/fal-next.ts`). A failure with money left, or with an unreadable balance, is the job's own and does not
  switch. A job keeps the account it was sent to (ids are prefixed `acct:personal|` or `acct:team|`), so jobs sent before the switch finish on the personal
  account; an id without the prefix is the personal one.
- **Balance.** Until the switch, the cost panel, the fal credit lock and the low-balance alert use both balances summed, so models do not lock while the
  team still has money; after it, the team's alone (`readFalBalances` in `packages/core/src/providers/balances.ts`).
- **After.** Once the switch has happened, and while no fal job is running (a running job's id still carries the `acct:` prefix, which a plain fal
  provider does not read), move the team key into `FAL_KEY`, remove `FAL_KEY_NEXT` and restart. `settings.fal_next_at` can stay set: it is
  read only while `FAL_KEY_NEXT` is set.

## Replicate (removed 2026-11-04)

Replicate has no adapter any more: no code path submits to it, `REPLICATE_API_TOKEN` is no longer read, and the hourly Replicate guard and its fal twin
switching are gone. Migration 0072 (2026-11-05) removed the rest: the `replicate` rows of `model_configs`, the `replicate` value of the provider checks
of `model_configs` and `jobs`, and the `settings.replicate_credit_usd` and `replicate_credit_since` columns. Old `replicate` rows in the ledger
(the October 2026 bake-off line, $9.248, which keeps its model text because `cost_entries` is append-only) and in `provider_invoices` still show in Admin
Costs as "Replicate"; new Replicate invoices can no longer be entered.
