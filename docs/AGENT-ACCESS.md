# Agent access ("Kết nối AI")

An AI agent (Claude Code, a script, an automation) can call the CVS API as the Admin who created its token. This page covers the first release:
personal access tokens over REST. Code: `apps/web/src/lib/agent-access.ts`, called only from `guard()` in `apps/web/src/lib/session.ts`.

## What a token is

- A personal access token looks like `cvs_pat_<12-character id>_<43-character secret>`. The server keeps only its SHA-256; the secret is shown
  once, right after it is made, and cannot be shown again.
- A token acts as the Admin who created it, in the workspace that was active when it was made. The `cvs_ws` cookie is never read for it.
- It works on API routes only. A page opened with a token is a signed-out visit (login redirect, no app HTML).
- It stops working (401 `unauthenticated`) when it is unknown, revoked or expired, or when its owner is banned, must change a temporary
  password, is no longer an Admin, or is no longer an active member of the token's (enabled) workspace. A demotion pauses the token; a
  re-promotion restores it. `CVS_AGENT_API_MEMBERS=1` lets a member's tokens work too (off by default).
- A request that carries both a token and a session cookie is refused (400 `ambiguous_credentials`). No CORS headers are sent, so a page on
  another site cannot add an `Authorization` header.

## Creating and managing tokens (Admins only)

Settings > "Kết nối AI". The routes behind it (`/api/agent-access/tokens`) take only an Admin's own cookie session: not a token, not a session
opened with "sign in as", and for a write only a request this app's page sent.

- Creating a token needs a sign-in in the last 10 minutes (403 `reauth_required`; sign out and in again).
- Expiry: 7, 30 or 90 days (default 30). There is no token without an expiry.
- Monthly cap: 0 to 1000 USD (default 20), checked on the server too.
- A user holds at most 10 active tokens (409 `too_many_tokens`).
- Any Admin can list every token (`?all=1`), rename one, change its cap and revoke it. A revoked token fails on its next request. Each change is
  audited.

## Calling the API

Send the token in the `Authorization` header:

```sh
curl -s https://video.vetgroup.net/api/me/limits -H "Authorization: Bearer $CVS_TOKEN"
```

Reads (GET) answer at once. Every write needs a confirm, below.

### Dry run and confirm

A write is first answered with **428** and a confirm token bound to that exact request: the connection, the method, the path with its query,
and the body (JSON is compared with its keys sorted, so key order and spacing do not matter). Send the same request again with the header
`x-cvs-confirm: <confirmToken>` within 10 minutes.

```sh
body='{"monthlyCapUsd":"250"}'
dry=$(curl -s -X PUT https://video.vetgroup.net/api/admin/settings \
  -H "Authorization: Bearer $CVS_TOKEN" -H 'content-type: application/json' -d "$body")
# {"error":"confirm_required","method":"PUT","path":"/api/admin/settings","summary":{...},"confirmToken":"...","expiresAt":"..."}
curl -s -X PUT https://video.vetgroup.net/api/admin/settings \
  -H "Authorization: Bearer $CVS_TOKEN" -H 'content-type: application/json' \
  -H "x-cvs-confirm: $(printf '%s' "$dry" | jq -r .confirmToken)" -d "$body"
```

The 428 `summary` shows the body's top-level fields so a human can check what will change before the agent resends it.

**Paid creates** (`POST /api/jobs`, `/api/remakes`, `/api/analyses`, `/api/suggestions`, and `/api/custom-apps/<id>/run`, which goes through
`/api/jobs`) check their own confirm. Their 428 also carries `estimateUsd` (null for analyses and suggestions, which have no upfront price) and
`tokenMonth: { usedUsd, capUsd }`. Nothing is written by a dry run.

Writes that need no confirm: `POST /api/assets`, `/api/assets/presign-video`, `/api/assets/finalize-video` (uploads cost nothing),
`POST /api/jobs/<id>/cancel`, and `POST /api/library/zip`, `/api/library/lookbook` (reads sent as POST). Matched by exact method and route,
never by prefix.

A body over 1 MB, or a chunked body with no `content-length`, is 413 `body_too_large_for_confirm`; a multipart body on a write that needs a
confirm is 415 `multipart_not_confirmable`.

### Replay and retries

- **Paid creates replay.** Resending a confirm that already created something returns the first answer (same status, same body, for example the
  same job id) and does no new work, even if the cap has been reached since. A safe retry after a timeout is simply the same request.
- **Every other write spends its confirm before the handler runs.** A resend gets **409 `confirm_used`**, even if the first attempt failed or
  timed out. On `confirm_used` an agent must read the current state (the resource, or the list it belongs to). If the change is there, it is
  done; if not, it starts again with a new dry run. It must never treat a 409 as success.
- `confirm_invalid`: the request differs from the one the token was made for, or the token is malformed. `confirm_expired`: older than 10
  minutes. `confirm_stale` (paid creates): the price changed; the answer carries a fresh confirm token for the new price.

### Monthly cap

The spend of a token is everything booked through it in the current month (Asia/Ho_Chi_Minh time): its jobs' estimates and actual costs,
remakes, and the LLM cost of its analyses and suggestions, plus the estimate of its open remakes. A Run or remake whose estimate would take the
spend over the cap is refused (429 `token_monthly_usd`); an analysis or suggestion is refused once the spend reaches the cap. Because those two
have no upfront price, the spend can pass the cap by the calls already running: at most one analysis per user plus the day's remaining
suggestions. Measured on production over the 30 days to 2026-11-28, the costliest analysis booked $0.0222 (p99 $0.0216, 37 calls) and the
costliest suggestion $0.0028 (p99 $0.0022, 88 calls), so the overrun is cents, not dollars. The cap is an extra ceiling: the team and company caps and team billing apply to agent runs exactly as to runs from the browser.

## What a token can never do

These routes answer 403 `not_allowed_for_agent` for every method: `/api/admin/users` (creates users, including Admins), `/api/auth`,
`/api/me/stop-impersonating`, `/api/me/sessions`, `/api/agent-access` (a token cannot make or change tokens) and `/api/oauth`. Writes (not reads)
are refused on `/api/me/profile`, `/api/admin/workspaces` (a new workspace creates an owner account) and `/api/workspaces/<id>/members`.

A path holding an encoded slash or backslash (`%2F`, `%5C`, any case) or a `.` or `..` segment is refused first, with 400 `bad_path`, so
routing and the deny list cannot read one path two ways.

## Rate limits

Per token: 120 requests a minute, 30 dry runs a minute, 10 confirmed paid creates a minute. Failed sign-ins: 20 a minute per client IP (an IPv6
client counts per /64). Over a limit the answer is 429 `rate_limited` with an `X-Retry-After` header in seconds.

The counters live in the memory of the single web process (they reset on a restart). Failed sign-ins are counted apart from tokens, up to
50,000 addresses each: past that a new address is not limited (secrets are 256-bit, so guessing is moot), and a token not yet counted waits a
minute rather than evicting another one's counter. A flood of bad tokens from new addresses therefore never slows a valid token.

## Audit

Never a token, secret or hash; the target is `api_token:<id>`.

| Row | When |
|---|---|
| `agent.request` | every agent write that reaches its handler (method, path, workspace, confirm nonce) |
| `agent.read` | every agent GET under `/api/admin/` |
| `agent.refused` | a request refused before its handler: 400 `bad_path`, 403 `not_allowed_for_agent`, 409 `confirm_invalid` / `confirm_expired` / `confirm_used` (method, path, reason) |
| `agent.token_create`, `agent.token_update`, `agent.token_revoke` | token lifecycle, by the Admin who did it |

Log lines (no audit row): `agent.dry_run` for each 428 of a non-paid write (a dry run is the first step of every write, and the confirmed write
gets its own row; the 30-a-minute limit bounds them), `agent.auth_fail` for a failed sign-in, `agent.cap_refused` for a cap refusal.
Spent confirms (`agent_confirms`) are deleted after a day by the daily purge job.

## Kill switch

`CVS_AGENT_API=0` in the web's environment (then restart it) turns every token off at once: each request is 401 `agent_api_off`, new tokens
are refused (409 `agent_api_off`) and Settings shows agent access as off. Tokens are kept, so removing the setting restores them.

## Troubleshooting

| Answer | Meaning |
|---|---|
| 400 `ambiguous_credentials` | a session cookie was sent with the token; send only the token |
| 400 `bad_path` | encoded slash/backslash or a dot segment in the path |
| 401 `unauthenticated` / `agent_api_off` | see "What a token is" / "Kill switch" |
| 403 `not_allowed_for_agent` | the route is in the deny list |
| 409 `confirm_*` | see "Replay and retries" |
| 409 `workspace_changed` | an `x-cvs-workspace` header names another workspace than the token's; leave it out |
| 413, 415 | body too large, chunked or multipart for a confirm |
| 428 `confirm_required` | resend with `x-cvs-confirm` |
| 429 `rate_limited` / `token_monthly_usd` | wait `X-Retry-After` seconds / raise the cap or wait for next month |

## Residual risks

- **A leaked token can confirm its own writes, including Admin writes.** The confirm makes an agent state each write and its price, and lets a
  human in the loop check it; it does not stop whoever holds the token. The bounds are the monthly cap, the deny list (no users, no tokens, no
  sign-in or sessions), the rate limits, the expiry, the audit rows and revoking. The owner accepted this (Q1). Keep tokens out of chats, logs
  and repositories, give each agent its own token with a short expiry and a low cap, and revoke one at the first doubt.
- An agent's analyses and suggestions can pass the cap by the calls already running (see "Monthly cap").
- The idle-refresh theft window applies only to OAuth refresh tokens, which come in a later update; personal access tokens have no refresh.

## MCP and OAuth: coming in a later update

An MCP endpoint (tools for Claude and other MCP clients, with the same confirms) and OAuth sign-in for clients that cannot hold a token will
come in a later update. Until then, use a personal access token over REST.
