# Agent access

An AI agent (Claude Code, OpenMausBot, a script, an automation) can call the CVS API as the Admin who created its token, or who approved its
sign-in ("OAuth" below), over REST or over MCP. Code: `apps/web/src/lib/agent-access.ts`, called only from `guard()` in
`apps/web/src/lib/session.ts`; the MCP endpoint is `apps/web/src/app/api/mcp/route.ts` with `apps/web/src/lib/mcp/`; the OAuth server is
`apps/web/src/lib/oauth.ts`. A token and an approved sign-in are both a connection (`api_tokens`), so what follows applies to both unless it
says otherwise.

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

Settings > "Connect AI". The routes behind it (`/api/agent-access/tokens`) take only an Admin's own cookie session: not a token, not a session
opened with "sign in as", and for a write only a request this app's page sent.

- Creating a token needs a sign-in in the last 10 minutes (403 `reauth_required`; sign out and in again).
- Expiry: 7, 30 or 90 days (default 30), or never (`days: null`). A token that never expires works until it is revoked by
  hand or by one of the credential resets below; it is paused while its owner is not an Admin.
- A user holds at most 10 active tokens (409 `too_many_tokens`).
- Any Admin can list every token (`?all=1`), rename one and revoke it. A revoked token fails on its next request. Each change is
  audited.
- A user's active tokens are revoked (reason `credentials_reset`, audited) when the user changes the password, signs out every other session,
  deletes a passkey or unlinks a sign-in method, and when an Admin sets a temporary password, turns 2FA off or removes a sign-in method.

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
`tokenMonth: { usedUsd }`, the connection's spend this month. Nothing is written by a dry run.

Writes that need no confirm: `POST /api/assets`, `/api/assets/presign-video`, `/api/assets/finalize-video` (uploads cost nothing),
`POST /api/jobs/<id>/cancel`, and `POST /api/library/zip`, `/api/library/lookbook` (reads sent as POST). Matched by exact method and route,
never by prefix.

A body over 1 MB, or a chunked body with no `content-length`, is 413 `body_too_large_for_confirm`; a multipart body on a write that needs a
confirm is 415 `multipart_not_confirmable`.

### Replay and retries

- **Paid creates replay.** Resending a confirm that already created something returns the first answer (same status, same body, for example the
  same job id) and does no new work, even if a cap has been reached since. A safe retry after a timeout is simply the same request.
- **Every other write spends its confirm before the handler runs.** A resend gets **409 `confirm_used`**, even if the first attempt failed or
  timed out. On `confirm_used` an agent must read the current state (the resource, or the list it belongs to). If the change is there, it is
  done; if not, it starts again with a new dry run. It must never treat a 409 as success.
- `confirm_invalid`: the request differs from the one the token was made for, or the token is malformed. `confirm_expired`: older than 10
  minutes. `confirm_stale` (paid creates): the price changed; the answer carries a fresh confirm token for the new price.

### Spend and caps

A connection has no cap of its own (owner decision 2026-11-28). The member and company caps and team billing apply to agent runs exactly as
to runs from the browser, with the same 429 answers. The spend of a connection is everything booked through it in the current month
(Asia/Ho_Chi_Minh time): its jobs' estimates and actual costs, remakes, and the LLM cost of its analyses and suggestions, plus the estimate of
its open remakes. Settings shows it for each connection, and a paid dry run reports it as `tokenMonth.usedUsd`.

## What a token can never do

These routes answer 403 `not_allowed_for_agent` for every method: `/api/admin/users` (creates users, including Admins), `/api/auth`,
`/api/me/stop-impersonating`, `/api/me/sessions`, `/api/agent-access` (a token cannot make or change tokens) and `/api/oauth`. Writes (not reads)
are refused on `/api/me/profile`, `/api/admin/workspaces` (a new workspace creates an owner account) and `/api/workspaces/<id>/members`.

A path holding an encoded slash or backslash (`%2F`, `%5C`, any case) or a `.` or `..` segment is refused first, with 400 `bad_path`, so
routing and the deny list cannot read one path two ways.

## Rate limits

Per token: 120 requests a minute, 30 dry runs a minute, 10 confirmed paid creates a minute. Failed sign-ins: 20 a minute per client IP (an IPv6
client counts per /64). Over a limit the answer is 429 `rate_limited` with an `X-Retry-After` header in seconds. Over MCP, each request to
`/api/mcp` (one tool call) counts once against the 120; the dry-run and paid limits apply to tool calls exactly as to REST.

The counters live in the memory of the single web process (they reset on a restart). Failed sign-ins are counted apart from tokens, up to
50,000 addresses each: past that a new address is not limited (secrets are 256-bit, so guessing is moot), and a token not yet counted waits a
minute rather than evicting another one's counter. A flood of bad tokens from new addresses therefore never slows a valid token.

## Audit

Never a token, secret or hash; the target is `api_token:<id>`.

| Row | When |
|---|---|
| `agent.request` | every agent write that reaches its handler (method, path, workspace, confirm nonce), also when an MCP tool made it |
| `agent.tool` | every MCP tool call, one row (tool, a 16-hex digest of its arguments, outcome); never the arguments |
| `agent.read` | every agent GET under `/api/admin/` |
| `agent.refused` | a request refused before its handler: 400 `bad_path`, 403 `not_allowed_for_agent`, 409 `confirm_invalid` / `confirm_expired` / `confirm_used` (method, path, reason) |
| `agent.token_create`, `agent.token_update`, `agent.token_revoke` | token lifecycle, by the Admin who did it (an OAuth code reuse revokes with reason `code_reuse`, a client's own RFC 7009 revoke with `oauth_revoke`) |
| `agent.oauth_consent` | an Admin approved an OAuth client: client id, its self-declared name, the redirect host, workspace |
| `agent.oauth_refresh_reuse` | a spent refresh token came back after the grace: the connection was revoked |

Log lines (no audit row): `agent.dry_run` for each 428 of a non-paid write (a dry run is the first step of every write, and the confirmed write
gets its own row; the 30-a-minute limit bounds them), `agent.auth_fail` for a failed sign-in.
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
| 429 `rate_limited` | wait `X-Retry-After` seconds |
| 429 with a cap message | a member or company cap is full, as in the browser; wait for the next day or month, or ask an Admin |

## Residual risks

- **A leaked token can confirm its own writes, including Admin writes.** The confirm makes an agent state each write and its price, and lets a
  human in the loop check it; it does not stop whoever holds the token. The bounds are the member and company caps, the deny list (no users, no
  tokens, no sign-in or sessions), the rate limits, the expiry, the audit rows and revoking. The owner accepted this (Q1). Keep tokens out of
  chats, logs and repositories, give each agent its own token with a short expiry, and revoke one at the first doubt.
- **A leaked token that never expires stays valid** until it is revoked by hand or by its owner's password change (or
  another credential reset revokes it). Prefer an expiry; a never-expiring token is for an agent that runs unattended, and it is listed as
  never expiring in Settings so an Admin can find and revoke it.
- **OAuth idle refresh.** A stolen refresh token can be rotated by the thief while the real client is idle, and the thief keeps a working
  connection until the real client next refreshes; that refresh then hits reuse detection and revokes the connection
  (`agent.oauth_refresh_reuse`). Meanwhile the bounds are the member and company caps, the deny list, the rate limits, the audit rows with the
  last-used IP in Settings, and Disconnect in Settings. Personal access tokens have no refresh.

## MCP

`POST <host>/api/mcp`, Streamable HTTP, stateless: the 2026-07-28 protocol, and 2025-era clients (`initialize`, then one POST per call) through
the SDK's stateless fallback (`@modelcontextprotocol/server`). Send the same token as for REST in `Authorization: Bearer`. A request with no
valid token (a session cookie alone included) is 401 with
`WWW-Authenticate: Bearer realm="cvs", resource_metadata="<APP_URL>/.well-known/oauth-protected-resource/api/mcp"` (plus `error="invalid_token"`
for a bad token), which starts the OAuth sign-in in a client that has no token; `CVS_AGENT_API=0` answers 503. A JSON-RPC batch (an array body) is 400
`batch_not_supported`: send one message per POST.

The token is checked once per request at `/api/mcp`, as `guard()` checks it, and the request counts one unit of the per-minute limit (its tool
call included). Each tool then calls the app's own route handler in-process, with the session carried by AsyncLocalStorage (never by a header,
so no header a client sends can name another session) and honoured only for the requests the tool built: the caps, confirms, deny list, ledger
and `agent.request` rows are the routes' own. A paid tool refuses `dryRun: true` with a `confirmToken` (`bad_input`), and `library_list` pages
through the newest 1000 Library items.

**Claude Code**

```sh
claude mcp add --scope user --transport http cvs https://<host>/api/mcp --header "Authorization: Bearer $CVS_TOKEN"
claude mcp list   # cvs: ... - Connected
```

**OpenMausBot**: merge into `mcpServers` in `~/.openmausbot/config.json` (the entry shape OpenMausBot reads: `type`, `url`, `headers`,
`enabled`):

```json
{ "mcpServers": { "cvs": { "type": "http", "url": "https://<host>/api/mcp", "headers": { "Authorization": "Bearer <token>" }, "enabled": true } } }
```

Check either one by asking the AI to call the `whoami` tool of `cvs`.

| Tool | Does | Hints |
|---|---|---|
| `whoami` | the user, workspace, connection and its spend this month; call it first | read |
| `limits_get` | the member caps used and the connection's month spend | read |
| `models_list` | models of a feature with their price and the recommended one | read |
| `apps_list` | app features with their input slots, and the published one-tap apps | read |
| `stores_list` | stores the user may bill | read |
| `asset_upload` | an image as base64 (at most 5 MB), or a video by presign, PUT, finalize | write, free |
| `job_create` | a video, image or app job, or a one-tap app run | paid, confirm |
| `jobs_list` | the user's jobs, newest first, 20 a page with `nextCursor` | read |
| `job_get` | status, error, output asset and its download path, app url | read |
| `job_cancel` | cancel a queued job | destructive |
| `analysis_create` | analyze a video into scenes | paid, confirm |
| `analysis_get` | status and a short summary of the scenes | read |
| `remake_create` | Smart Remake of chosen scenes with a product image | paid, confirm |
| `remake_get` | status, cost, output asset and its download path | read |
| `library_list` | the workspace Library, 20 a page with `nextCursor` | read |

Read tools carry `readOnlyHint`; the paid ones `openWorldHint` and not idempotent; `job_cancel` `destructiveHint`.

**Confirm through tools.** A paid tool called without `confirmToken` is the dry run: it answers `dryRun: true`, `estimateUsd` (null for an
analysis, which is not priced upfront), `confirmToken` and the connection's month. The agent shows the estimate to the user and, once they
agree, calls the tool again with the same arguments plus `confirmToken`. A changed argument is `confirm_invalid`, a changed price
`confirm_stale` (with the new estimate and token). A `confirmToken` sent a second time is a tool error `confirm_used` with `replay: true` and
the first answer (`firstAnswer.jobId`), never a second success: read the state (`job_get`) before asking for a new dry run.

**Downloads**: `job_get` and `remake_get` give `downloadPath` (`/api/assets/<id>/content`); fetch it with the same header:
`curl -H "Authorization: Bearer $CVS_TOKEN" -o clip.mp4 https://<host>/api/assets/<id>/content`. Humans use the item's `url`.

## OAuth

A client that supports MCP sign-in (Claude Code, OpenMausBot) connects without a pasted token: it registers itself, opens the CVS consent page in
the browser, and an Admin approves it there. The approved client is a connection like a token (same deny list, caps, confirms, audit and revoke), of
kind `oauth`, and it does not expire while it is used. Settings > "Connect AI" shows the setup text as the first way, sign-in (recommended).

**Claude Code**

```sh
claude mcp add --scope user --transport http cvs https://<host>/api/mcp
claude mcp list   # cvs: ... - Needs authentication
```

Then type `/mcp` in Claude Code, pick `cvs` and choose Authenticate (or run `claude mcp login cvs`). The browser opens `/oauth/authorize`; after
Allow, Claude Code receives the code at its own `http://localhost:<port>/callback`. Without `--scope user`
(`claude mcp add --transport http cvs https://<host>/api/mcp`) the server is added to the current project only.

**OpenMausBot**: merge into `mcpServers` in `~/.openmausbot/config.json`, with no `headers`:

```json
{ "mcpServers": { "cvs": { "type": "http", "url": "https://<host>/api/mcp", "enabled": true } } }
```

then use the sign-in card OpenMausBot shows for `cvs`. It registers as `OpenMausBot` with the loopback callback
`http://127.0.0.1:<port>/mcp-oauth/callback`, so sign in from a browser on the same computer as OpenMausBot (a remote browser's https callback is
refused, see below).

**The consent page** (`/oauth/authorize`, Admins only). A signed-out visitor goes through the login and comes back with the full query. The page
shows the client's self-declared name and the host it returns to (for example `127.0.0.1:PORT`, "on this computer") on their own lines and the workspace, then
Allow or Deny. Approving needs a sign-in in the last 10 minutes (else a "sign in again" button). An unknown
client or a redirect it did not register gets an error page and is never redirected to; a member is sent back with `error=access_denied`, as is
Deny. A user holds at most 10 active connections, tokens and approved clients together; an approved connection whose code was never exchanged
is revoked (`code_unused`) at the next approval after 10 minutes.

**Endpoints** (the issuer and every URL come from `APP_URL`, never the `Host` header; no CORS headers, both clients are native):

| URL | What |
|---|---|
| `/.well-known/oauth-protected-resource/api/mcp`, `/.well-known/oauth-protected-resource` | RFC 9728: `resource` `<APP_URL>/api/mcp`, `authorization_servers` `[APP_URL]` |
| `/.well-known/oauth-authorization-server` | RFC 8414: PKCE `S256` only, grants `authorization_code` and `refresh_token`, auth method `none`, `iss` on responses (RFC 9207) |
| `POST /api/oauth/register` | RFC 7591, a JSON body (`content-type: application/json`, else 400 `invalid_client_metadata`): 1 to 3 redirect URIs, each `http://` on `127.0.0.1`, `localhost` or `[::1]` (any port, RFC 8252), no query or fragment; https and other hosts are refused in this version. Name at most 80 characters. 10 registrations an hour per address (429). A client nobody approved is deleted after a day; at 200 waiting the oldest is evicted |
| `POST /api/oauth/authorize` | the consent form (cookie, same origin, Admin, not "sign in as"); not for clients |
| `POST /api/oauth/token` | `authorization_code` (client, exact redirect and PKCE verifier must match; the code lives 5 minutes and is spent by the first attempt, right or wrong; a second use revokes the connection) and `refresh_token` |
| `POST /api/oauth/revoke` | RFC 7009: ends the client's own connection; always 200 |

Every `/api/oauth/*` endpoint takes 60 requests a minute per address.

`localhost` is accepted beside the loopback literals `127.0.0.1` and `[::1]` because Claude Code's callback is `http://localhost:<port>/callback`; RFC 8252 §8.3 prefers the literals, but current browsers resolve `localhost` to loopback only. The consent page adds a warning line when the client was registered from another address than the approving browser's.

**Tokens.** The access token `cvs_oat_<43>` lives one hour and is sent as `Authorization: Bearer` exactly like a personal access token. The refresh
token `cvs_ort_<43>` lives 30 days from its issue and is rotated on every use: the same old token sent again by the same client within 30 seconds
gets the same new pair (a retry after a lost answer); any later use is treated as a stolen copy and revokes the connection. So a connection idle for
30 days ends, and one in use never does. Only SHA-256 hashes are stored; the grace answer is kept encrypted with a key derived from the old refresh
token, which the server does not keep. A refresh with another client's `client_id` is `invalid_grant` and does not spend the token. Each refresh
re-checks the owner as a request does: a banned, demoted or removed owner gets `invalid_grant` without spending the token, so the same token works
again after a re-promotion.

**Ending a connection.** Disconnect (the button on an app row) in Settings > "Connect AI" (any Admin, for any connection) revokes it: its access token is 401 and its
refresh token `invalid_grant` on the next request. The client's own revoke, a password change, "sign out everywhere" and the kill switch work as for
tokens; with `CVS_AGENT_API=0` every `/api/oauth/*` endpoint answers 503.

**Not yet**: https (web) redirect URIs, scopes (a connection has the Admin's full agent rights) and client secrets. Before production, check that
`APP_URL` equals the public URL byte for byte and that Cloudflare does not challenge `/api/mcp`, `/api/oauth/*` or `/.well-known/*`.
