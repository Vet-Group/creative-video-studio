# Vertex accounts

The app can use two Google Cloud projects ("Vertex accounts") for the Vertex AI models, in order. Owner decision of 2026-11-03: use
`cvs-vertex` while its FreeTrial credit lasts and never let Google charge its card, then move to `creative-video-studio` by itself, which keeps
being used after its own credits end. The Vertex model rows stay disabled until the owner enables them; nothing here enables a model.

## Environment

Both the web app and the worker read `<app>/.env`.

| Variable | Account |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Account 1: path of its service-account JSON key. The project is `GOOGLE_CLOUD_PROJECT` when set, else the key's `project_id`. |
| `GOOGLE_APPLICATION_CREDENTIALS_NEXT` | Account 2 (optional): path of its key; the project is the key's `project_id`. |
| `GOOGLE_CLOUD_LOCATION` | The region of the Imagen models, for both accounts (default `us-central1`). |

An account is named by its project id. A bad account 1 key stops the worker at start-up, as before. An account 2 key that is missing,
unreadable, without a `project_id` or of the same project as account 1 is logged and left out; the app runs on account 1 alone. Restart both
units after a change (`cvs-web.service`, `cvs-worker.service`).

## IAM each key needs, on its own project

| Role | Where | Why |
|---|---|---|
| `roles/aiplatform.user` (Vertex AI User) | the project | the image and video calls |
| `roles/bigquery.dataViewer` (BigQuery Data Viewer) | the dataset `billing_export` | read the standard billing export |
| `roles/bigquery.jobUser` (BigQuery Job User) | the project | run the billing query (at most 100 MB billed per query) |

The project also needs the BigQuery API and the Cloud Billing API enabled (the price check reads the Cloud Billing Catalog), and a standard usage
cost export to BigQuery into a dataset named `billing_export` in the same project (Billing > Billing export). The app finds the table itself: the
one in `billing_export` whose name starts with `gcp_billing_export_v1_`. Until a role is granted the read answers 403; the Costs page then shows that it has no access
to the billing export of that project, and an account set to stop when its credits end is not used until the read works (see below). Grant
the roles before setting that flag on a new account. The export lags hours behind usage, and its
first rows arrive about a day after it is enabled.

## Credits and switching

Google has no API for a credit balance. Admin Settings, section Vertex accounts, holds, per account, the credit total and its currency, the expiry date
and whether to stop when the credits end; each change is audited as `vertex_account.update`. Migration 0050 seeds `cvs-vertex` with 7,825,800 VND expiring
2026-12-30, set to stop. Remaining credit = the total minus the FreeTrial and promotion credits the export shows as used on that project
(all services, all time), converted to USD at the export's latest rate.

The worker runs a tick at start-up and every hour (inside the worker process, no unit of its own), so a change in Admin Settings takes effect
within the hour. For each configured account in order it reads the export and decides whether the account is usable: an account set to stop is
not usable once its remaining credit is under 15 USD, from the day before its expiry date (UTC), or while its export cannot be read (no access,
no export yet, or a failed read): it fails closed so its card is never charged. An account not set to stop keeps being used when its export
cannot be read. Either way the Costs page flags it "unverified". The first usable account becomes `settings.vertex_active_project`; a change is audited as `vertex.switch_account`
with no actor (the audit log names the system as the actor). With no usable account a new Vertex job is refused before any call to Google and its estimate is
released.

A job keeps the account that took it: the provider job id starts with `acct:<project>|`, and status and cancel go to that account. An id without
the prefix was sent before accounts existed and belongs to account 1, so jobs in flight survive a deploy.

## Daily ledger booking

Once a UTC day (the first hourly tick of the day whose reads all succeed; a failed read retries the next hour), the tick books Google's Vertex
total into the ledger as the `vertex` provider invoice (`bookInvoice`, the same booking as an Admin entering it on the Costs page, audited as
`invoice.enter` with no actor): the current month, and the previous month while the UTC day is 5 or earlier. The total is the sum over every
configured account of the Vertex AI cost in USD (cost / currency_conversion_rate, before credits). A month is skipped unless every account was
read, and skipped when no account has a row for it, so a missing export never books 0. Because the export lags hours behind the jobs, the current
month is booked only when Google's total is at least what the ledger already holds for it (otherwise the worker logs and waits for a later day);
the previous month is final by the 5th and books its difference even when negative.

The Costs page reads Google live when it opens (cached 5 minutes per month): each account's month by SKU, its credits, the active account, and the
app's Veo 3.1 prices against the Catalog (SKUs `4D50-275D-FC3F` silent and `F64B-2A78-7BAE` with audio, USD per second), red when they differ
by more than 1%.

## Retiring cvs-vertex

1. Configure `creative-video-studio` as `GOOGLE_APPLICATION_CREDENTIALS_NEXT`, grant its key the roles above and enter its credits in Admin
   Settings. The switch happens by itself when `cvs-vertex` runs low or expires; check the audit log for `vertex.switch_account`.
2. Keep the `cvs-vertex` key configured as account 1 until the 6th of the month after the switch, so the previous month is booked completely
   and its jobs in flight finish.
3. Then make `creative-video-studio` account 1: set its key as `GOOGLE_APPLICATION_CREDENTIALS`, clear `GOOGLE_APPLICATION_CREDENTIALS_NEXT`
   (and `GOOGLE_CLOUD_PROJECT` if it named `cvs-vertex`), and restart both units. The `cvs-vertex` row stays in Settings for the record.
