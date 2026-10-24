#!/usr/bin/env bash
# Usage: install.sh [--dry-run]
# Installs Creative Video Studio on the VET host as root user units (docs/ops/deploy.md). Modelled on Ideas Hub's install-units.sh.
#   --dry-run  print every command and file it would write, change nothing, exit 0 when the preconditions pass.
#              A failing precondition prints "[dry-run] would fail: <reason>" and exits 1.
# Steps: check the preconditions (root, tools, deploy key, .env mode 600), refuse if a port is taken, clone/update the repo
# with a read-only deploy key, install the pinned Node, build, start the compose project, migrate, install and enable the
# cvs-* units, and (with CLOUDFLARE_API_TOKEN) create the tunnel and its DNS record. Everything it creates is recorded in
# <app>/install.state so uninstall.sh can undo exactly that. With a state file present the run is an update: ports held by
# this install's own compose project and cvs-web are not "taken", and a recorded tunnel is kept.
# Env (defaults): CVS_APP_DIR (/opt/creative-video-studio; absolute, last part creative-video-studio), CVS_REPO_URL (the GitHub
# SSH URL; no user or password in an https URL), CVS_REPO_REF (main), CVS_DEPLOY_KEY (~/.ssh/cvs_deploy_ed25519, the key install-gate-key.sh made), CVS_HOSTNAME
# (video.vetgroup.net), CVS_ZONE (vetgroup.net), CLOUDFLARE_API_TOKEN, CVS_STATE_DIR (~/.local/state/creative-video-studio;
# holds ops.lock, shared with cvs-backup), CVS_ROOT_HOME (/root; HOME is forced to it so `systemctl --user` and
# ~/.config/systemd/user agree), CVS_LISTEN_FILE (a file in `ss -ltnH` format that replaces running ss; for tests).
# Values missing from the environment are read from <app>/.env (CLOUDFLARE_API_TOKEN, S3_BUCKET, CVS_RESTIC_PASSWORD,
# CVS_R2_*). Secret values are never printed, and the Cloudflare/R2/restic ones are not passed to pnpm.
set -euo pipefail

# Node pinned to an exact version inside the root package.json "engines" range. The tarball's sha256 is checked against
# SHASUMS256.txt from the same nodejs.org release directory.
# shortcut: the checksum list itself is not GPG-verified, so it only catches corruption, not a hostile nodejs.org; add gpg if that matters.
node_version=24.22.1
project=creative-video-studio
ports=(3400 5435 9400 9401)

dry=0
case "${1:-}" in
  --dry-run) dry=1 ;;
  "") ;;
  -h | --help) awk 'NR > 1 { if (/^#/) print; else exit }' "$0"; exit 0 ;;
  *) awk 'NR > 1 { if (/^#/) print; else exit }' "$0" >&2; exit 2 ;;
esac

export HOME="${CVS_ROOT_HOME:-/root}"
here="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
app="${CVS_APP_DIR:-/opt/creative-video-studio}"
repo_url="${CVS_REPO_URL:-git@github.com:anhtahaylove/creative-video-studio.git}"
repo_ref="${CVS_REPO_REF:-main}"
deploy_key="${CVS_DEPLOY_KEY:-$HOME/.ssh/cvs_deploy_ed25519}"
public_host="${CVS_HOSTNAME:-video.vetgroup.net}"
zone="${CVS_ZONE:-vetgroup.net}"
state_file="$app/install.state"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
backup_env="$HOME/.config/creative-video-studio/backup.env"
ops_state="${CVS_STATE_DIR:-$HOME/.local/state/creative-video-studio}"
node_dir="$app/node"
tmp=""
# Secrets that belong to Cloudflare, R2 and restic only: pnpm install, the build and the migrations never see them.
scrub=(env -u CLOUDFLARE_API_TOKEN -u CVS_R2_REPOSITORY -u CVS_R2_ACCESS_KEY_ID -u CVS_R2_SECRET_ACCESS_KEY -u CVS_RESTIC_PASSWORD)

say() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
precheck() { # a read-only precondition: a real run stops here, a dry run says it would
  if [ "$dry" = 1 ]; then printf '[dry-run] would fail: %s\n' "$*"; exit 1; fi
  fail "$*"
}
run() {
  if [ "$dry" = 1 ]; then printf '[dry-run] %s\n' "$*"; else printf '==> %s\n' "$*"; "$@"; fi
}
app_run() { # like run, from inside the app directory
  if [ "$dry" = 1 ]; then printf '[dry-run] (cd %s) %s\n' "$app" "$*"; else printf '==> (cd %s) %s\n' "$app" "$*"; (cd "$app" && "$@"); fi
}
record() { # $1 = key=value, kept once in the state file
  if [ "$dry" = 1 ]; then printf '[dry-run] record %s\n' "$1"; return 0; fi
  mkdir -p "$app"
  grep -qxF "$1" "$state_file" 2> /dev/null || printf '%s\n' "$1" >> "$state_file"
}

[[ $public_host =~ ^[a-z0-9.-]+$ && $zone =~ ^[a-z0-9.-]+$ ]] || fail "CVS_HOSTNAME and CVS_ZONE may only hold a-z, 0-9, dots and dashes"
[[ $repo_url =~ ://[^/]*@ ]] && fail "CVS_REPO_URL must not carry a user or password; use the SSH form git@github.com:... with the deploy key"
# The app directory is written to and its recorded files are removed: it must be exactly ours.
[[ $app == /* && $app != *..* && "$(basename "$app")" == "$project" ]] || fail "CVS_APP_DIR must be an absolute path ending in /$project"

# 1. Preconditions. All of them only read, so a dry run checks them too.
[ "$(id -u)" = 0 ] || precheck "not root: the units are root user units"
for c in git docker curl tar xz sha256sum systemctl loginctl base64 mktemp flock; do command -v "$c" > /dev/null || precheck "$c is not installed"; done
[ -r "$deploy_key" ] || precheck "deploy key $deploy_key is not readable (set CVS_DEPLOY_KEY)"
[ -f "$app/.env" ] || precheck "$app/.env is missing; copy .env.example to it and fill it first"
[ "$(stat -c %a "$app/.env")" = 600 ] || precheck "$app/.env must be mode 600 (it holds secrets)"
# A checkout of another repository in the app directory is never touched.
if [ -d "$app/.git" ] && [ "$(git -C "$app" remote get-url origin 2> /dev/null || true)" != "$repo_url" ]; then
  precheck "$app is a git checkout whose origin is not CVS_REPO_URL; refusing to change it"
fi
if [ "$dry" = 1 ]; then say "dry run: nothing below is executed"; fi
uid="$(id -u)"
# Not inherited: under `su` without `-` it would point systemctl --user at another user's manager.
export XDG_RUNTIME_DIR="/run/user/$uid"
export PATH="$node_dir/bin:$PATH"

# Settings the environment lacks come from <app>/.env (KEY=VALUE lines; surrounding double quotes and CR are dropped).
while IFS= read -r line; do
  k="${line%%=*}"; v="${line#*=}"
  v="${v%$'\r'}"; v="${v#\"}"; v="${v%\"}"
  if [ -z "${!k:-}" ]; then export "$k=$v"; fi
done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$app/.env" || true)
cloudflared_bin="$(command -v cloudflared || true)"
# Ideas Hub installed it as root's user binary, outside PATH (its ideashub-tunnel unit runs /root/.local/bin/cloudflared).
if [ -z "$cloudflared_bin" ] && [ -x "$HOME/.local/bin/cloudflared" ]; then cloudflared_bin="$HOME/.local/bin/cloudflared"; fi
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "$cloudflared_bin" ]; then
  precheck "cloudflared is not installed; install it, or unset CLOUDFLARE_API_TOKEN to deploy without the hostname"
fi

# 2. Ports. `ss -ltnH` prints the local address in column 4; CVS_LISTEN_FILE replaces it so tests need no ss.
# With a state file this is an update: what our own compose project and cvs-web listen on is not "taken".
own=()
if [ -f "$state_file" ]; then
  [ -z "$(cd "$app" && docker compose -p "$project" ps -q 2> /dev/null || true)" ] || own+=(5435 9400 9401)
  if systemctl --user is-active --quiet cvs-web.service 2> /dev/null; then own+=(3400); fi
fi
if [ -n "${CVS_LISTEN_FILE:-}" ]; then
  listing="$(cat "$CVS_LISTEN_FILE")" || fail "cannot read CVS_LISTEN_FILE"
elif command -v ss > /dev/null; then
  listing="$(ss -ltnH)" || fail "ss failed, so the ports cannot be checked"
else
  fail "ss is not installed, so the ports cannot be checked"
fi
taken=()
for p in "${ports[@]}"; do
  [[ " ${own[*]:-} " != *" $p "* ]] || continue
  if awk -v p="$p" '$4 ~ (":" p "$") { found = 1 } END { exit !found }' <<< "$listing"; then taken+=("$p"); fi
done
[ ${#taken[@]} -eq 0 ] || fail "port(s) ${taken[*]} already in use; Creative Video Studio needs ${ports[*]}. Nothing was changed."
if [ ${#own[@]} -eq 0 ]; then say "ports ${ports[*]} are free"; else say "ports ${ports[*]} are free or held by this install (${own[*]}): an update"; fi

# 3. One lock with cvs-backup and the drill (they take the same ops.lock), so nothing below runs under a backup.
if [ "$dry" = 1 ]; then
  say "[dry-run] flock $ops_state/ops.lock (shared with cvs-backup)"
else
  mkdir -p "$ops_state"
  exec 9> "$ops_state/ops.lock"
  flock -w 2400 9 || fail "ops.lock is still held (a backup or drill is running) after 40 minutes"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
fi

# 4. Repository, over a read-only deploy key (only its path is used; the key is never read here).
run mkdir -p "$app"
export GIT_SSH_COMMAND="ssh -i $deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
say "git uses the deploy key at $deploy_key"
if [ -d "$app/.git" ]; then
  run git -C "$app" fetch --quiet origin "$repo_ref"
  run git -C "$app" merge --ff-only --quiet "origin/$repo_ref"
else
  run git -C "$app" init --quiet
  run git -C "$app" remote add origin "$repo_url"
  run git -C "$app" fetch --quiet origin "$repo_ref"
  run git -C "$app" checkout --quiet -B "$repo_ref" "origin/$repo_ref"
fi

units_src="$app/deploy/linux"
[ -f "$units_src/cvs-web.service" ] || units_src="$here"

# 5. Pinned Node.
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64) arch=arm64 ;;
  *) fail "unsupported CPU $(uname -m)" ;;
esac
tag="node-v$node_version-linux-$arch"
base="https://nodejs.org/dist/v$node_version"
if [ "$("$node_dir/bin/node" --version 2> /dev/null || true)" = "v$node_version" ]; then
  say "node v$node_version is already in $node_dir"
elif [ "$dry" = 1 ]; then
  say "[dry-run] download $base/$tag.tar.xz and $base/SHASUMS256.txt"
  say "[dry-run] sha256sum -c on the $tag.tar.xz line of SHASUMS256.txt"
  say "[dry-run] extract into $node_dir"
else
  say "==> installing node v$node_version from $base"
  curl -fsSL -o "$tmp/$tag.tar.xz" "$base/$tag.tar.xz"
  curl -fsSL -o "$tmp/SHASUMS256.txt" "$base/SHASUMS256.txt"
  (cd "$tmp" && grep " $tag.tar.xz\$" SHASUMS256.txt | sha256sum -c -) || fail "sha256 of $tag.tar.xz does not match SHASUMS256.txt; nothing was installed"
  rm -rf "$node_dir.new"
  mkdir -p "$node_dir.new"
  tar -xJf "$tmp/$tag.tar.xz" --strip-components=1 -C "$node_dir.new"
  rm -rf "$node_dir"
  mv "$node_dir.new" "$node_dir"
fi

# pnpm, at the version package.json pins, installed next to the pinned Node.
pnpm_version="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\).*/\1/p' "$app/package.json" 2> /dev/null || true)"
if [ -z "$pnpm_version" ]; then
  [ "$dry" = 1 ] || fail "no pnpm version in $app/package.json (packageManager)"
  pnpm_version="<packageManager version>"
fi
if [ "$(cd / && pnpm --version 2> /dev/null || true)" != "$pnpm_version" ]; then
  run "${scrub[@]}" npm install --global --silent --prefix "$node_dir" "pnpm@$pnpm_version"
fi

# 6. Dependencies, build, data services, bucket, migrations (the seed rows are part of the migrations).
app_run "${scrub[@]}" pnpm install --frozen-lockfile
app_run "${scrub[@]}" pnpm --filter @cvs/web build
record "compose=$project" # before `up`, so a failed or half-done start can still be undone with uninstall.sh
app_run docker compose -p "$project" up -d --wait
bucket="${S3_BUCKET:-cvs-media}"
# shellcheck disable=SC2016 # the $VARS are meant to expand inside the MinIO container, not here
app_run docker compose -p "$project" exec -T minio sh -c 'MC_HOST_ih="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@127.0.0.1:9000" exec mc mb --ignore-existing "ih/$1"' mc "$bucket"
app_run "${scrub[@]}" pnpm --filter @cvs/db migrate
# The first Admin (plan D.5). create-user reads the email and password from the environment, so neither is printed, and it
# leaves an email that already has an account alone, so a re-run changes nothing.
if [ -n "${CVS_ADMIN_EMAIL:-}" ] && [ -n "${CVS_ADMIN_PASSWORD:-}" ]; then
  app_run "${scrub[@]}" pnpm --filter @cvs/web auth:create-user --first-admin
else
  say "CVS_ADMIN_EMAIL or CVS_ADMIN_PASSWORD is not set in $app/.env: no first Admin is created"
fi

# 7. Backup settings: the units read backup.env, built from .env when it does not exist yet.
if [ ! -f "$backup_env" ]; then
  if [ "$dry" = 1 ]; then
    say "[dry-run] write $backup_env (mode 600) from CVS_RESTIC_PASSWORD and CVS_R2_*"
  else
    [ -n "${CVS_RESTIC_PASSWORD:-}" ] || fail "set CVS_RESTIC_PASSWORD in $app/.env, or create $backup_env"
    mkdir -p "$(dirname "$backup_env")"
    (
      umask 077
      : > "$backup_env"
      for v in CVS_RESTIC_PASSWORD CVS_R2_REPOSITORY CVS_R2_ACCESS_KEY_ID CVS_R2_SECRET_ACCESS_KEY; do
        if [ -n "${!v:-}" ]; then printf '%s=%s\n' "$v" "${!v}" >> "$backup_env"; fi
      done
    )
    say "==> wrote $backup_env (mode 600)"
  fi
fi
r2=1
for v in CVS_R2_REPOSITORY CVS_R2_ACCESS_KEY_ID CVS_R2_SECRET_ACCESS_KEY; do
  if [ -f "$backup_env" ]; then grep -q "^$v=." "$backup_env" || r2=0; elif [ -z "${!v:-}" ]; then r2=0; fi
done

units=(cvs-web.service cvs-worker.service cvs-backup.service cvs-backup.timer cvs-drill.service cvs-drill.timer)
enable=(cvs-web.service cvs-worker.service cvs-backup.timer cvs-drill.timer)
if [ "$r2" = 1 ]; then
  units+=(cvs-backup-weekly.service cvs-backup-weekly.timer)
  enable+=(cvs-backup-weekly.timer)
else
  say "R2 is not configured: the weekly off-host copy is skipped; nightly local backups still run"
fi

# 8. Tunnel and DNS, only with a Cloudflare token.
cf() { # $1 = method, $2 = API path, $3 = optional file holding the JSON body; the token goes over stdin, not argv
  local args=(--silent --show-error --max-time 30 --request "$1" --header 'Content-Type: application/json')
  if [ -n "${3:-}" ]; then args+=(--data-binary "@$3"); fi
  printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" | curl --config - "${args[@]}" "https://api.cloudflare.com/client/v4$2"
}
jget() { # $1 = JSON, $2 = dotted path from the top of the reply (result.0.id); exits 1 with Cloudflare's errors when success is not true
  printf '%s' "$1" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let j;
      try { j = JSON.parse(s); } catch { console.error("Cloudflare sent a reply that is not JSON"); process.exit(1); }
      if (!j.success) { console.error("Cloudflare refused: " + JSON.stringify(j.errors ?? [])); process.exit(1); }
      let v = j;
      for (const k of process.argv[1].split(".")) v = v?.[k];
      console.log(v ?? "");
    });' "$2"
}
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  say "skipping the tunnel and DNS step: CLOUDFLARE_API_TOKEN is not set, so the app is deployed without the public hostname"
elif grep -q '^tunnel_id=' "$state_file" 2> /dev/null; then
  # Only a complete tunnel (id, DNS record, credentials, config) is kept; a half-made one needs uninstall.sh first.
  recorded_tunnel="$(sed -n 's/^tunnel_id=//p' "$state_file" | head -n 1)"
  if [[ $recorded_tunnel =~ ^[0-9a-f-]{36}$ ]] && grep -q '^dns_record_id=.' "$state_file" &&
    [ -f "$app/cloudflared/$recorded_tunnel.json" ] && [ -f "$app/cloudflared/cvs.yml" ]; then
    say "a complete tunnel is already recorded in $state_file; keeping it"
  else
    fail "$state_file records a tunnel without its DNS record or cloudflared files; run $here/uninstall.sh first, then install.sh again"
  fi
  units+=(cvs-tunnel.service)
  enable+=(cvs-tunnel.service)
elif [ "$dry" = 1 ]; then
  say "[dry-run] cloudflare GET /zones?name=$zone (zone id and account id)"
  say "[dry-run] cloudflare GET /zones/<zone id>/dns_records?name=$public_host (refuse when the record already exists)"
  say "[dry-run] cloudflare POST /accounts/<account id>/cfd_tunnel (name $project, config_src local)"
  record "tunnel_id=<tunnel id>"
  say "[dry-run] write $app/cloudflared/<tunnel id>.json (mode 600) and $app/cloudflared/cvs.yml"
  say "[dry-run] cloudflare POST /zones/<zone id>/dns_records (CNAME $public_host to <tunnel id>.cfargotunnel.com)"
  record "dns_record_id=<record id>"
  units+=(cvs-tunnel.service)
  enable+=(cvs-tunnel.service)
else
  zone_json="$(cf GET "/zones?name=$zone")"
  zone_id="$(jget "$zone_json" result.0.id)"
  account_id="$(jget "$zone_json" result.0.account.id)"
  [[ $zone_id =~ ^[0-9a-f]{32}$ && $account_id =~ ^[0-9a-f]{32}$ ]] || fail "the token does not see zone $zone"
  existing="$(jget "$(cf GET "/zones/$zone_id/dns_records?name=$public_host")" result.0.id)"
  [ -z "$existing" ] || fail "DNS record $public_host already exists; refusing to change it"
  secret="$(head -c 32 /dev/urandom | base64 -w0)"
  (umask 077; printf '{"name":"%s","tunnel_secret":"%s","config_src":"local"}' "$project" "$secret" > "$tmp/tunnel.json")
  tunnel_id="$(jget "$(cf POST "/accounts/$account_id/cfd_tunnel" "$tmp/tunnel.json")" result.id)"
  [[ $tunnel_id =~ ^[0-9a-f-]{36}$ ]] || fail "Cloudflare returned an unexpected tunnel id"
  record "tunnel_id=$tunnel_id"
  record "account_id=$account_id"
  record "zone_id=$zone_id"
  mkdir -p "$app/cloudflared"
  (umask 077; printf '{"AccountTag":"%s","TunnelSecret":"%s","TunnelID":"%s"}\n' "$account_id" "$secret" "$tunnel_id" > "$app/cloudflared/$tunnel_id.json")
  record "file=$app/cloudflared/$tunnel_id.json"
  sed -e "s|@APP@|$app|g" -e "s|@TUNNEL_ID@|$tunnel_id|g" -e "s|@HOSTNAME@|$public_host|g" "$units_src/cloudflared-cvs.yml.example" > "$app/cloudflared/cvs.yml"
  record "file=$app/cloudflared/cvs.yml"
  printf '{"type":"CNAME","name":"%s","content":"%s.cfargotunnel.com","proxied":true}' "$public_host" "$tunnel_id" > "$tmp/dns.json"
  dns_id="$(jget "$(cf POST "/zones/$zone_id/dns_records" "$tmp/dns.json")" result.id)"
  [[ $dns_id =~ ^[0-9a-f]{32}$ ]] || fail "Cloudflare returned an unexpected DNS record id"
  record "dns_record_id=$dns_id"
  say "==> created tunnel $tunnel_id and the DNS record for $public_host"
  units+=(cvs-tunnel.service)
  enable+=(cvs-tunnel.service)
fi

# 9. Units. The backup units name /opt/creative-video-studio; it is rewritten when CVS_APP_DIR differs.
run mkdir -p "$unit_dir"
for name in "${units[@]}"; do
  filled="$(sed -e "s|@APP@|$app|g" -e "s|/opt/creative-video-studio|$app|g" -e "s|@CLOUDFLARED@|${cloudflared_bin:-/usr/bin/cloudflared}|g" "$units_src/$name")"
  if [ "$dry" = 1 ]; then
    printf '[dry-run] write %s/%s:\n%s\n\n' "$unit_dir" "$name" "$filled"
  else
    printf '%s\n' "$filled" > "$unit_dir/$name"
    say "==> wrote $unit_dir/$name"
  fi
  record "unit=$name"
done
if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2> /dev/null || true)" != yes ]; then
  run loginctl enable-linger "$(id -un)"
fi
run systemctl --user daemon-reload
run systemctl --user enable --now "${enable[@]}"
# enable --now leaves a unit that is already running on its old code, so an update restarts the app units after the new build.
if [ ${#own[@]} -gt 0 ]; then run systemctl --user restart cvs-web.service cvs-worker.service; fi
say "done. State: $state_file; undo with $here/uninstall.sh"
