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
pass (free ports; for uninstall, a valid state file). Lines start with `[dry-run]`; a real run prints `==>` instead.

## What install.sh does, in order

1. Refuses (exit 1, nothing changed) if any of ports 3400, 5435, 9400 or 9401 is taken (`ss -ltnH`).
2. Clones or fast-forwards the repo into `/opt/creative-video-studio` over a read-only deploy key. Only the key's path is
   used; its content is never read or printed.
3. Installs the pinned Node (**24.22.1**, inside the root `engines` range) into `/opt/creative-video-studio/node`. The tarball is
   downloaded from `https://nodejs.org/dist/v24.22.1/` and checked with `sha256sum -c` against that release's `SHASUMS256.txt`.
   Then pnpm at the `packageManager` version is installed next to it.
4. `pnpm install --frozen-lockfile` and `pnpm --filter @cvs/web build`.
5. `docker compose -p creative-video-studio up -d --wait`, creates the MinIO bucket (`S3_BUCKET`, default `cvs-media`; the
   production worker does not create it) and runs `pnpm --filter @cvs/db migrate`. The seed rows (the default team, the
   model configs, the presets) are part of the migrations, so there is no separate seed step.
6. Writes `~/.config/creative-video-studio/backup.env` (mode 600) from `CVS_RESTIC_PASSWORD` and `CVS_R2_*` if the file is missing.
7. With `CLOUDFLARE_API_TOKEN`: finds the zone, refuses if the DNS record already exists, creates the tunnel
   `creative-video-studio`, writes `cloudflared/<id>.json` (mode 600) and `cloudflared/cvs.yml`, and creates only the
   new CNAME `video.vetgroup.net`. **Without the token this step is skipped** and the app is deployed without the public hostname.
8. Writes and enables the units `cvs-web`, `cvs-worker` (each `MemoryMax=768M`, `Restart=on-failure`), `cvs-backup.timer`,
   `cvs-drill.timer` (monthly), `cvs-backup-weekly.timer` (only if all three `CVS_R2_*` are set) and `cvs-tunnel` (only if step 7 ran).

`MemoryMax=768M` for web and worker is the plan's expected value. Plan step D.3 (measuring the headroom next to Ideas Hub) was
skipped, so the values wait for that measurement.

Settings come from the environment first, then from `/opt/creative-video-studio/.env`, which must exist before a real run.
Other variables: `CVS_APP_DIR`, `CVS_REPO_URL`, `CVS_REPO_REF`, `CVS_DEPLOY_KEY` (default `~/.ssh/cvs-deploy`), `CVS_HOSTNAME`, `CVS_ZONE`.
`CVS_LISTEN_FILE` (a file in `ss -ltnH` format) replaces the port probe; the tests use it.

If a run stops half way, run `uninstall.sh` and then `install.sh` again: the stack's own ports count as taken while it is up.

## The state file

`/opt/creative-video-studio/install.state` lists what install.sh created, one `key=value` per line:
`unit=<name>`, `tunnel_id`, `account_id`, `zone_id`, `dns_record_id`, and `file=<path under cloudflared/>`.
Each line is written as soon as the thing exists, so a failed install can still be undone.

## uninstall.sh

Reads only the state file and validates every line; a unit that is not named `cvs-*`, a file outside `cloudflared/`, or a
malformed id makes it refuse before running anything. Then it:

1. disables and removes the recorded units;
2. runs `docker compose -p creative-video-studio down`. **Volumes are kept**: `-v` is never passed, so the database and the videos survive;
3. deletes the DNS record and the tunnel by their recorded ids (needs `CLOUDFLARE_API_TOKEN`; without it they stay in Cloudflare
   and the state file is kept so the script can run again);
4. removes the recorded files and the state file.

It never touches other units, other compose projects, `/opt/creative-video-studio` itself, the backups, or any Ideas Hub or POD Studio path.
