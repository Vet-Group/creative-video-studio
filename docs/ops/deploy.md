# Deploying to the VET host

`deploy/linux/install.sh` and `deploy/linux/uninstall.sh` install and remove Creative Video Studio as **root user units**
(`systemctl --user` under root, `XDG_RUNTIME_DIR=/run/user/0`) in `/opt/creative-video-studio`, the same way Ideas Hub is run.
Deploy only under the owner's pre-approval (plan section 3). Nothing here runs by itself.

## Dry run first

```
deploy/linux/install.sh --dry-run
deploy/linux/uninstall.sh --dry-run
```

`--dry-run` prints every command and every unit file it would write, changes nothing, and exits 0 when the preconditions
pass (for install: root, the required tools, the deploy key, `.env` present with mode 600, `cloudflared` when a token is set,
a free port set; for uninstall, a valid state file). Lines start with `[dry-run]`; a real run prints `==>` instead.
A failed read-only precondition prints `[dry-run] would fail: <reason>` and exits 1. `uninstall.sh --dry-run` ends with
"dry run: nothing was changed".

## Before the first deploy: the VET `.env` (owner)

The run's gate key cannot write files on VET, so the `.env` is placed once with the owner's `vet-linux` profile, like A.0c:

```
bash scripts/run/provision-vet-env.sh --dry-run   # the names it would write, no ssh
bash scripts/run/provision-vet-env.sh
```

It copies only the names in `.env.example` from this checkout's `.env` (so `FAL_ADMIN_KEY` never reaches VET), sets `APP_URL` to
`https://video.vetgroup.net`, keeps the `BETTER_AUTH_SECRET` already on VET or makes a new one, writes the file with mode 600, and
prepares `/opt/creative-video-studio` as a checkout with the right `origin`, so the gate's `deploy <commit>` fetches into it. Run it
again after changing a value in `.env`; then `deploy` again so the services read it.

## What install.sh does, in order

0. Checks the preconditions (it forces `HOME=/root`, so `systemctl --user` and `~/.config/systemd/user` agree; `CVS_APP_DIR` must be
   absolute and end in `creative-video-studio`, and an existing git checkout there must have the configured `origin`; a repo URL with a
   user or password is refused; use the `git@github.com:...` SSH form with the deploy key).
1. Refuses (exit 1, nothing changed) if any of ports 3400, 5435, 9400 or 9401 is taken (`ss -ltnH`), then takes the same
   `~/.local/state/creative-video-studio/ops.lock` that `cvs-backup` uses (waits up to 40 minutes).
2. Clones or fast-forwards the repo into `/opt/creative-video-studio` over a read-only deploy key. Only the key's path is
   used; its content is never read or printed.
3. Installs the pinned Node (**24.22.1**, inside the root `engines` range) into `/opt/creative-video-studio/node`. The tarball is
   downloaded from `https://nodejs.org/dist/v24.22.1/` and checked with `sha256sum -c` against that release's `SHASUMS256.txt`.
   Then pnpm at the `packageManager` version is installed next to it.
4. `pnpm install --frozen-lockfile` and `pnpm --filter @cvs/web build`. These, and the migrations, run without
   `CLOUDFLARE_API_TOKEN`, `CVS_R2_*` and `CVS_RESTIC_PASSWORD` in their environment.
5. Records `compose=creative-video-studio` in the state file, then `docker compose -p creative-video-studio up -d --wait`, creates the MinIO bucket (`S3_BUCKET`, default `cvs-media`; the
   production worker does not create it) and runs `pnpm --filter @cvs/db migrate`. The seed rows (the default team, the
   model configs, the presets) are part of the migrations, so there is no separate seed step. Then, when `CVS_ADMIN_EMAIL` and
   `CVS_ADMIN_PASSWORD` are set, it creates that Admin (`auth:create-user --first-admin`); an email that already has an account is left alone.
6. Writes `~/.config/creative-video-studio/backup.env` (mode 600) from `CVS_RESTIC_PASSWORD` and `CVS_R2_*` if the file is missing.
7. With `CLOUDFLARE_API_TOKEN`: finds the zone, refuses if the DNS record already exists, creates the tunnel
   `creative-video-studio`, writes `cloudflared/<id>.json` (mode 600) and `cloudflared/cvs.yml`, and creates only the
   new CNAME `video.vetgroup.net`. **Without the token this step is skipped** and the app is deployed without the public hostname.
8. Writes and enables the units `cvs-web`, `cvs-worker` (each `MemoryMax=768M`, `Restart=on-failure`), `cvs-backup.timer`,
   `cvs-drill.timer` (monthly), `cvs-backup-weekly.timer` (only if all three `CVS_R2_*` are set) and `cvs-tunnel` (only if step 7 ran).

`MemoryMax=768M` for web and worker was confirmed by plan step D.3 against the measured headroom next to Ideas Hub; see
[`production.md`](production.md).

The Cloudflare token needs these permissions (unverified: not yet tried against the real account): Zone:Read and DNS:Edit on the
`vetgroup.net` zone, and Account / Cloudflare Tunnel:Edit.

Settings come from the environment first, then from `/opt/creative-video-studio/.env`, which must exist before a real run.
Other variables: `CVS_APP_DIR`, `CVS_REPO_URL`, `CVS_REPO_REF`, `CVS_DEPLOY_KEY` (default `~/.ssh/cvs_deploy_ed25519`, the read-only key `scripts/run/install-gate-key.sh` created), `CVS_HOSTNAME`, `CVS_ZONE`.
`CVS_LISTEN_FILE` (a file in `ss -ltnH` format) replaces the port probe; the tests use it.

### Re-running and updating

A state file means the next `install.sh` is an update, and it works without uninstalling (which would delete the tunnel and the
DNS record): ports held by this install's own compose project (`docker compose -p creative-video-studio ps -q` is not empty) or
by `cvs-web` are not counted as taken, the repo is fast-forwarded, and a recorded tunnel is kept, but only when its DNS record id
and both `cloudflared/` files exist. After the build, an update restarts `cvs-web` and `cvs-worker` so they run the new code. A tunnel recorded without them (a run that stopped in step 7) is refused with
"run uninstall.sh first". A run that stopped after `compose up` can be undone with `uninstall.sh`, because the compose line was
recorded before `up`.

## Status

`bash scripts/run/vet.sh status` runs `deploy/linux/status.sh` on VET (read-only): the commit, the `cvs-*` units, the compose
containers, the answer of `https://video.vetgroup.net/privacy` and the last backup log line.

## The state file

`/opt/creative-video-studio/install.state` lists what install.sh created, one `key=value` per line:
`compose=creative-video-studio` (the only accepted value), `unit=<name>`, `tunnel_id`, `account_id`, `zone_id`, `dns_record_id`,
and `file=<path under cloudflared/>`. Each line is written as soon as the thing exists, so a failed install can still be undone.

## uninstall.sh

Reads only the state file and validates every line; a unit that is not named `cvs-*`, a file outside `cloudflared/`, or a
malformed id makes it refuse before running anything. Then it:

1. disables and removes the recorded units;
2. runs `docker compose -p creative-video-studio down` from the app directory, even when the state file holds only the `compose` line.
   **Volumes are kept**: `-v` is never passed, so the database and the videos survive;
3. removes the recorded files;
4. deletes the DNS record and the tunnel by their recorded ids (needs `CLOUDFLARE_API_TOKEN`; without it they stay in Cloudflare
   and the state file is kept so the script can run again). HTTP 404 counts as already deleted; the tunnel DELETE is tried four times
   because cloudflared connections can linger for a moment after `cvs-tunnel` stops. The token goes to `curl` over stdin, never on a command line;
5. removes the state file.

Each state line is removed as soon as its resource is gone, so after a partial Cloudflare failure the file holds only what is left
(for example `tunnel_id` and the `account_id` it needs) and the script can simply be run again.

It never touches other units, other compose projects, `/opt/creative-video-studio` itself, the backups, or any Ideas Hub or POD Studio path.
