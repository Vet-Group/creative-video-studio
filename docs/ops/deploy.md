# Deploying to the VET host

`deploy/linux/install.sh` and `deploy/linux/uninstall.sh` install and remove Creative Video Studio as **root user units**
(`systemctl --user` under root, `XDG_RUNTIME_DIR=/run/user/0`) in `/opt/creative-video-studio`, the same way Ideas Hub is run.
The exception is the worker: `cvs-worker` is a system unit (`systemctl`, without `--user`) that runs as the unprivileged user
`cvs-worker` (see [The worker's user](#the-workers-user)).
Deploy only under the owner's pre-approval (plan section 3). Nothing here runs by itself.

## Standing operations permission (owner, 2026-11-02)

The run's pre-approval (`pnpm run:approve`) lasts 14 days and covers spend. For routine work after the run the owner
types a second, standing permission once:

```
pnpm run:ops-approve "<sentence>"
```

Run it without the sentence (or with a wrong one) and it prints the exact Vietnamese sentence to copy. Both approve
commands refuse to run inside a Claude Code session (`CLAUDECODE` or `CLAUDE_CODE_ENTRYPOINT` set): the owner types them in
their own terminal. `ops-approve` also refuses while a committed guard file has uncommitted edits, and lists the guard files
that changed since the last approval before it records them.

- It never expires and opens only the `vet.sh` verbs `deploy`, `status`, `backup` and `drill`. Every other verb, and the
  one-off key scripts (which call `guard-check` without a verb), still need a live run pre-approval.
- It grants no provider spend. That is the owner's word, not something `guard-check` can enforce: the app's own spend
  goes through its model settings and the monthly cap.
- Like `run:approve` it records the guard file hashes, and the files that decide the permission (`cli.ts`, `manifest.ts`,
  `preapproval.ts`) are guards too, so any change to a guard file halts every verb until the owner types it again.
- `pnpm run:ops-revoke` (or `node scripts/run/cli.ts ops-revoke`) drops it at once.

The server gate deploys only a commit that is already on `origin/main`: it fetches, refuses any other commit, and only then
checks it out and runs that commit's installer. After the gate changes, the owner uploads it again with
`bash scripts/run/install-gate-key.sh --gate-only` (needs a live run pre-approval and the owner's `vet-linux` SSH profile).

## Deploy when green

Owner rule (2026-11-28): CVS deploys as soon as `main` is green. There are no time slots and no trains.

```
pnpm ship <PR>                # merge, then the steps below
pnpm ship <PR> --watch        # first poll the PR every 60 s (up to 90 min) until its checks are green and it is mergeable
pnpm ship                     # no PR: ship the current origin/main
pnpm ship <PR> --dry-run      # read-only: PR checks, CI status, in-flight count, prod commit, the PRs that would ship
pnpm ship --wait-idle <min>   # how long to wait for in-flight work (default 20)
```

`pnpm ship` needs the standing permission above and `CVS_VET_HOST` set as for `vet.sh`; `CVS_SSH_HOST` (default `vet-linux`)
is the ssh profile used for the in-flight count and the read-back. It stops at the first failure with a non-zero exit and never
retries a merge or a deploy. In order:

1. With a PR: it must be open, not a draft, mergeable, with every check on its head green (skipped counts). It is squash-merged with
   `--match-head-commit`, and the remote branch is deleted through the API (not `--delete-branch`, which removes local worktrees).
   The target is the merge commit; with no PR it is `origin/main`.
2. CI: when the merge commit has the same tree as the PR head whose checks were green, nothing new has to be tested and it deploys
   at once (E2E's "Same tree already tested" does the same on `main`). When the PR was behind `main` the trees differ, so it waits
   up to 40 minutes for the workflows `CI` and `E2E` on the merge commit (success or skipped), failing fast on a failure or cancel.
3. It waits until no row in `jobs`, `analyses` or `remakes` is in a non-terminal state on prod (`--wait-idle`), then runs
   `vet.sh backup` and `vet.sh deploy <full sha>`.
4. Read-back: `vet.sh status` shows the target commit with `cvs-web` and `cvs-worker` active, `/login` answers 200 publicly and on
   the host, and it counts `error|fatal` lines in the `cvs-worker` journal since the deploy started (a warning, not a failure).

Two sessions can run `pnpm ship` at the same moment: the second deploy waits on `ops.lock` (`install.sh`, shared with backup)
and runs after the first.

The last line it prints is the one to send to the other sessions: `deployed <sha8> (#A, #B, ...), verified`. The PR numbers
come from the `(#N)` subjects between the commit prod ran before and the one it runs now.

## Dry run first

```
deploy/linux/install.sh --dry-run
deploy/linux/uninstall.sh --dry-run
```

`--dry-run` prints every command and every unit file it would write, changes nothing, and exits 0 when the preconditions
pass (for install: root, the required tools, the deploy key, `.env` present with mode 600 or 640, `cloudflared` when a token is set,
a free port set, and nothing the worker reads under `/root` or `/home`; for uninstall, a valid state file). Lines start with `[dry-run]`; a real run prints `==>` instead.
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

The worker loads the whole `.env` itself. With `OPENAI_API_KEY` set, Enhance, suggestions and translations run on OpenAI's `gpt-6-luna`;
without it they stay on fal (`FAL_KEY`). After adding or removing the key, restart the worker (`cvs-worker`).

## What install.sh does, in order

0. Checks the preconditions (it forces `HOME=/root`, so `systemctl --user` and `~/.config/systemd/user` agree; `CVS_APP_DIR` must be
   absolute and end in `creative-video-studio`, and an existing git checkout there must have the configured `origin`; a repo URL with a
   user or password is refused; use the `git@github.com:...` SSH form with the deploy key).
1. Refuses (exit 1, nothing changed) if any of ports 3400, 5435, 9400 or 9401 is taken (`ss -ltnH`), then takes the same
   `~/.local/state/creative-video-studio/ops.lock` that `cvs-backup` uses (waits up to 40 minutes).
2. Clones or fast-forwards the repo into `/opt/creative-video-studio` over a read-only deploy key. Only the key's path is
   used; its content is never read or printed. A detached checkout (what the gate's `deploy <commit>` leaves) keeps its commit:
   only a checkout on a branch is fetched and fast-forwarded. The gate runs the installer of the commit it deploys, so a rollback
   to a commit older than this rule still fast-forwards to the tip of `main`.
   Then it creates the system user `cvs-worker` when it is missing, makes the app directory `root:cvs-worker` mode 750 and `.env`
   `root:cvs-worker` mode 640, and checks as that user that it can read `.env`, the worker's code, the Vertex keys
   (`GOOGLE_APPLICATION_CREDENTIALS`, `..._NEXT`), run an already installed Node and, with `REA_ANALYZE_ENABLED=1`, run
   `rea-video --help`; a key or `rea-video` under `/root` or `/home` is refused too. The script runs under `umask 022` (secret
   files still under 077), so what it creates is readable by the worker whatever umask the gate's session has. Any of these
   stops the run before the build (see [The worker's user](#the-workers-user)).
3. Installs the pinned Node (**24.22.1**, inside the root `engines` range) into `/opt/creative-video-studio/node`. The tarball is
   downloaded from `https://nodejs.org/dist/v24.22.1/` and checked with `sha256sum -c` against that release's `SHASUMS256.txt`.
   Then pnpm at the `packageManager` version is installed next to it.
4. `pnpm install --frozen-lockfile` and `pnpm --filter @cvs/web build`. These, and the migrations, run without
   `CLOUDFLARE_API_TOKEN`, `CVS_R2_*` and `CVS_RESTIC_PASSWORD` in their environment. The build goes into a new directory,
   `apps/web/.next-<UTC time>-<commit>` (see [Web builds and rollback](#web-builds-and-rollback)); when it fails, the script removes
   that directory and exits 1 with "the web build failed, so nothing was switched or restarted", and `cvs-web` keeps running its build.
5. Records `compose=creative-video-studio` in the state file, then `docker compose -p creative-video-studio up -d --wait`, creates the MinIO bucket (`S3_BUCKET`, default `cvs-media`; the
   production worker does not create it) and runs `pnpm --filter @cvs/db migrate`. The seed rows (the default team, the
   model configs, the presets) are part of the migrations, so there is no separate seed step. Then, when `CVS_ADMIN_EMAIL` and
   `CVS_ADMIN_PASSWORD` are set, it creates that Admin (`auth:create-user --first-admin`); an email that already has an account is left alone.
6. Writes `~/.config/creative-video-studio/backup.env` (mode 600) from `CVS_RESTIC_PASSWORD` and `CVS_R2_*` if the file is missing.
7. With `CLOUDFLARE_API_TOKEN`: finds the zone, refuses if the DNS record already exists, creates the tunnel
   `creative-video-studio`, writes `cloudflared/<id>.json` (mode 600) and `cloudflared/cvs.yml`, and creates only the
   new CNAME `video.vetgroup.net`. **Without the token this step is skipped** and the app is deployed without the public hostname.
8. Writes and enables the units `cvs-web`, `cvs-worker` (each `MemoryMax=768M`, `Restart=on-failure`), `cvs-backup.timer`,
   `cvs-drill.timer` (monthly), `cvs-backup-weekly.timer` (daily R2 copy despite its name; only if all three `CVS_R2_*` are set) and `cvs-tunnel` (only if step 7 ran).
   `cvs-worker` goes to `/etc/systemd/system/cvs-worker.service` and is started with `systemctl restart cvs-worker.service`.

`MemoryMax=768M` for web and worker was confirmed by plan step D.3 against the measured headroom next to Ideas Hub; see
[`production.md`](production.md).

The Cloudflare token needs these permissions (unverified: not yet tried against the real account): Zone:Read and DNS:Edit on the
`vetgroup.net` zone, and Account / Cloudflare Tunnel:Edit.

Settings come from the environment first, then from `/opt/creative-video-studio/.env`, which must exist before a real run.
Other variables: `CVS_APP_DIR`, `CVS_REPO_URL`, `CVS_REPO_REF`, `CVS_DEPLOY_KEY` (default `~/.ssh/cvs_deploy_ed25519`, the read-only key `scripts/run/install-gate-key.sh` created), `CVS_HOSTNAME`, `CVS_ZONE`.
`CVS_LISTEN_FILE` (a file in `ss -ltnH` format) replaces the port probe; the tests use it.
An existing checkout whose origin is the same repository over anonymous HTTPS (`https://github.com/Vet-Group/creative-video-studio.git`)
is accepted as well. The repo is public, so this is how a host without a GitHub deploy key fetches: on 2026-11-01 the
Vet-Group organization had deploy keys disabled and the new VET host (192.168.1.31) was switched to it.

### Re-running and updating

A state file means the next `install.sh` is an update, and it works without uninstalling (which would delete the tunnel and the
DNS record): ports held by this install's own compose project (`docker compose -p creative-video-studio ps -q` is not empty) or
by `cvs-web` are not counted as taken, the repo is fast-forwarded when it is on a branch (a detached checkout keeps its commit), and a recorded tunnel is kept, but only when its DNS record id
and both `cloudflared/` files exist. After the build, an update restarts `cvs-web` and `cvs-worker` so they run the new code (the web first, on the new build directory, then the worker). The worker first lets the provider calls in flight finish, so its restart can take up to about 23 minutes (`TimeoutStopSec=1500`) when an image is being made. A tunnel recorded without them (a run that stopped in step 7) is refused with
"run uninstall.sh first". A run that stopped after `compose up` can be undone with `uninstall.sh`, because the compose line was
recorded before `up`.

### Web builds and rollback

Each run builds the web into its own directory, set through Next's `distDir` (`CVS_DIST_DIR`, read by `apps/web/next.config.ts`):
`apps/web/.next-<UTC time>-<commit>`, for example `.next-20261121093000-f267e7de`. The running `cvs-web` keeps serving the
directory its unit names (`Environment=CVS_DIST_DIR=` in `~/.config/systemd/user/cvs-web.service`) for the whole build, so a
failed build changes nothing it serves. Only after a successful build does step 8 write the unit with the new directory, and the
restart moves `cvs-web` to it. After that restart the script deletes the older build directories, keeping two: the one `cvs-web`
now runs and the previous one. Before this change the build lived in `apps/web/.next`; the first such deploy keeps it as the previous one.

What it does not cover: the gate's `git checkout` and `pnpm install` still change the source tree and `node_modules` in place
before the build (the running processes have their code loaded already), and a failure after the build (the migrations, the
tunnel step) still stops the script with the new build unused.

Fast web-only rollback to the previous build, as root on the host (`bash scripts/run/vet.sh status` prints the `web build` line
with both directories):

```
cd /opt/creative-video-studio/apps/web && ls -d .next-*
sed -i 's|^Environment=CVS_DIST_DIR=.*|Environment=CVS_DIST_DIR=<previous directory>|' ~/.config/systemd/user/cvs-web.service
XDG_RUNTIME_DIR=/run/user/0 systemctl --user daemon-reload
XDG_RUNTIME_DIR=/run/user/0 systemctl --user restart cvs-web.service
```

This swaps only the web build: the checkout, `node_modules`, the worker and the database stay at the new commit. Use it when both
commits have the same lockfile (in particular the same `next`) and no migration the old code cannot run with; otherwise roll back
with `bash scripts/run/vet.sh deploy <older commit>`, which builds that commit the same way. The next deploy rewrites the unit anyway.

## The worker's user

The worker feeds uploaded videos and images to `ffmpeg`, `ffprobe` and `rea-video`, so a decoder bug must not get root and the whole
host (Fable audit 2026-11-20, security #6). It runs as the system user `cvs-worker` (no login shell, home `/var/lib/cvs-worker`)
under `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes` and `PrivateTmp=yes`: everything is read-only for it except
its own `/tmp` (all its job files) and `/var/lib/cvs-worker` (`StateDirectory=`, systemd creates it owned by the user; `rea-video`
keeps its downloaded models there), and `/root` and `/home` are hidden. It reads `.env` through its group (`root:cvs-worker`, mode
640, not world-readable); `provision-vet-env.sh` keeps that group and mode when it rewrites the file. The app directory, which
`provision-vet-env.sh` creates with mode 700, becomes `root:cvs-worker` mode 750, so the worker may enter it and other users still may not.

Why a system unit: a unit in root's user manager cannot set `User=`. The other choice, a user manager of its own for `cvs-worker`
with lingering, would need a home and its own `systemctl --user -M cvs-worker@` handling, and its sandbox options depend on
unprivileged user namespaces, which Ubuntu restricts through AppArmor. A system unit gets `User=` and every sandbox option natively.
It drains like before (`TimeoutStopSec=1500`) and keeps `MemoryMax=2G`, now outside `user@0.service`.

The first deploy with this change moves the worker: after the web restart it runs `systemctl --user disable --now cvs-worker.service`
(the root worker finishes its provider calls first, up to about 23 minutes), removes that user unit and its `unit=` state line, then
starts the system unit. The new worker is only started after the old one stopped, so two never run.

Before that deploy (owner, as root on the host):

- `rea-video` was installed with `uv tool` as root (tool and Python under `/root/.local`, linked from `/usr/local/bin`), which the
  worker cannot reach. Reinstall the same commit outside `/root`: take the `git` URL and `rev` from
  `/root/.local/share/uv/tools/rea-video/uv-receipt.toml` (a checkout such as `/root/rea-video` may sit on another commit), for example
  `UV_TOOL_DIR=/opt/rea-video/tools UV_TOOL_BIN_DIR=/opt/rea-video/bin UV_PYTHON_INSTALL_DIR=/opt/rea-video/python uv tool install --python 3.12 --constraints /tmp/rea-constraints.txt "rea-video[asr] @ git+https://github.com/JuneYaooo/rea-video@<rev>"`,
  where the constraints pin the root install's dependencies (`uv pip freeze --python /root/.local/share/uv/tools/rea-video/bin/python`
  without its `rea-video` line; a fresh resolve picks newer patch releases), then `ln -sf /opt/rea-video/bin/rea-video /usr/local/bin/rea-video`.
  Smoke it as a non-root user behind the same `ProtectHome` first:
  `systemd-run --wait --pipe -p DynamicUser=yes -p ProtectHome=yes -p MemoryMax=2G /usr/local/bin/rea-video --help`.
  Its models (`~/.cache/rea-video/models`) are downloaded again into `/var/lib/cvs-worker` on the first analysis, unless
  `/root/.cache/rea-video` is copied to `/var/lib/cvs-worker/.cache/rea-video` after the deploy (`chown -R cvs-worker:cvs-worker`).
- A Vertex key under `/root` or `/home`: move it (for example to `/opt/creative-video-studio-keys/`, `root:cvs-worker`, mode 640) and
  point `GOOGLE_APPLICATION_CREDENTIALS` at the new path. A bad account 1 key stops the worker at start-up.

`install.sh` refuses (before anything is built or restarted) while either is still in the way, naming the file.

Back to the root worker (rollback), as root on the host:

```
systemctl disable --now cvs-worker.service           # drains like any stop
rm /etc/systemd/system/cvs-worker.service && systemctl daemon-reload
git -C /opt/creative-video-studio show <commit before this change>:deploy/linux/cvs-worker.service \
  | sed 's|@APP@|/opt/creative-video-studio|g' > /root/.config/systemd/user/cvs-worker.service
XDG_RUNTIME_DIR=/run/user/0 systemctl --user daemon-reload
XDG_RUNTIME_DIR=/run/user/0 systemctl --user enable --now cvs-worker.service
sed -i '/^system_unit=/d; /^user=/d' /opt/creative-video-studio/install.state   # older uninstall.sh refuses these lines
echo unit=cvs-worker.service >> /opt/creative-video-studio/install.state
```

Then deploy only commits before this change (their `install.sh` writes the root unit again), or the next deploy moves the worker back
to `cvs-worker`. Optionally give `/opt/creative-video-studio` (750) and its `.env` (640) back to group `root` and `.env` mode 600;
the user can stay (`userdel cvs-worker` removes it).

## Status

`bash scripts/run/vet.sh status` runs `deploy/linux/status.sh` on VET (read-only): the commit, the web build directory `cvs-web` runs and the ones on disk, the `cvs-*` units (root's user units and the `cvs-worker` system unit), the compose
containers, the answer of `https://video.vetgroup.net/privacy`, the last backup log line, and `perf` lines that tell a slow app from a
slow line: `/login` and a static file served on the server itself and through the tunnel, the server's download and upload speed to
Cloudflare, the tunnel's protocol and edge, and the CPU, load and memory. They add a few seconds and about 15 MB of traffic.

## The state file

`/opt/creative-video-studio/install.state` lists what install.sh created, one `key=value` per line:
`compose=creative-video-studio` (the only accepted value), `unit=<name>`, `system_unit=cvs-worker.service`, `user=cvs-worker` (only
when install.sh created the user), `tunnel_id`, `account_id`, `zone_id`, `dns_record_id`,
and `file=<path under cloudflared/>`. Each line is written as soon as the thing exists, so a failed install can still be undone.

## uninstall.sh

Reads only the state file and validates every line; a unit that is not named `cvs-*`, a file outside `cloudflared/`, or a
malformed id makes it refuse before running anything. Then it:

1. disables and removes the recorded units (the worker's system unit with `systemctl`, the others with `systemctl --user`), then
   deletes the user `cvs-worker` when install.sh created it. `/var/lib/cvs-worker` (the worker's model cache) stays;
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
