#!/usr/bin/env bash
# Usage: uninstall.sh [--dry-run]
# Undoes install.sh using only what <app>/install.state recorded (docs/ops/deploy.md):
#   - disables and removes the recorded cvs-* units (a state line that names any other unit makes it refuse);
#   - runs `docker compose -p creative-video-studio down` in the app directory, which KEEPS the volumes (never -v);
#   - removes the recorded files, then deletes the DNS record and the tunnel by their recorded ids (needs CLOUDFLARE_API_TOKEN).
# Each state line is removed as soon as its resource is gone, and an HTTP 404 on a Cloudflare DELETE counts as already gone,
# so a run that stopped half way can simply be run again. It never touches other units, other compose projects, or Ideas Hub /
# POD Studio paths. The app directory, the data volumes and the backups stay. --dry-run prints every command, changes nothing
# and exits 0 when the state file is valid.
# Env (defaults): CVS_APP_DIR (/opt/creative-video-studio; absolute, last part creative-video-studio), CLOUDFLARE_API_TOKEN
# (else read from <app>/.env), CVS_ROOT_HOME (/root; HOME is forced to it), CVS_RETRY_SLEEP (5; seconds between tunnel DELETE tries).
set -euo pipefail

project=creative-video-studio

dry=0
case "${1:-}" in
  --dry-run) dry=1 ;;
  "") ;;
  -h | --help) awk 'NR > 1 { if (/^#/) print; else exit }' "$0"; exit 0 ;;
  *) awk 'NR > 1 { if (/^#/) print; else exit }' "$0" >&2; exit 2 ;;
esac

export HOME="${CVS_ROOT_HOME:-/root}"
app="${CVS_APP_DIR:-/opt/creative-video-studio}"
state_file="$app/install.state"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
uid="$(id -u)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$uid}"

say() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
run() {
  if [ "$dry" = 1 ]; then printf '[dry-run] %s\n' "$*"; else printf '==> %s\n' "$*"; "$@"; fi
}
soft() { # a step that may already be done; its failure is reported, not fatal
  run "$@" || say "warning: '$*' failed; continuing"
}
drop() { # forget one state line once its resource is gone
  [ "$dry" = 1 ] && return 0
  grep -vxF -- "$1" "$state_file" > "$state_file.new" || true
  mv "$state_file.new" "$state_file"
}

[[ $app == /* && $app != *..* && "$(basename "$app")" == "$project" ]] || fail "CVS_APP_DIR must be an absolute path ending in /$project"
[ -f "$state_file" ] || fail "$state_file does not exist: nothing is recorded, so nothing is removed"

# Read the state file; every value is validated because it ends up in a path or an API URL.
unit_re='^cvs-[a-z0-9-]+\.(service|timer)$'
units=()
files=()
tunnel_id="" account_id="" zone_id="" dns_id=""
while IFS= read -r line; do
  val="${line#*=}"
  case "$line" in
    unit=*)
      [[ $val =~ $unit_re ]] || fail "$state_file lists '$val', which is not a cvs-* unit; refusing"
      units+=("$val") ;;
    file=*)
      case "$val" in
        "$app"/cloudflared/*) ;;
        *) fail "$state_file lists a file outside $app/cloudflared; refusing" ;;
      esac
      [[ $val != *..* ]] || fail "$state_file lists a path with '..'; refusing"
      files+=("$val") ;;
    compose=*)
      [ "$val" = "$project" ] || fail "$state_file lists compose project '$val', not $project; refusing" ;;
    tunnel_id=*)
      [[ $val =~ ^[0-9a-f-]{36}$ ]] || fail "bad tunnel id in $state_file"
      tunnel_id="$val" ;;
    account_id=* | zone_id=* | dns_record_id=*)
      [[ $val =~ ^[0-9a-f]{32}$ ]] || fail "bad id in $state_file: ${line%%=*}"
      case "$line" in account_id=*) account_id="$val" ;; zone_id=*) zone_id="$val" ;; *) dns_id="$val" ;; esac ;;
    "") ;;
    *) fail "unknown line in $state_file; refusing" ;;
  esac
done < "$state_file"

# 1. Units: stop and disable first, so the tunnel has no connection when it is deleted.
for u in "${units[@]}"; do
  soft systemctl --user disable --now "$u"
  run rm -f "$unit_dir/$u"
  drop "unit=$u"
done
if [ ${#units[@]} -gt 0 ]; then run systemctl --user daemon-reload; fi

# 2. This compose project only, from the app directory so no other directory's compose file is used; no -v, so the data volumes stay.
cd "$app"
run docker compose -p "$project" down
drop "compose=$project"

# 3. Recorded files.
if [ ${#files[@]} -gt 0 ]; then
  run rm -f "${files[@]}"
  for f in "${files[@]}"; do drop "file=$f"; done
fi

# 4. Cloudflare, by the recorded ids only. 2xx and 404 (already gone) count as deleted; the token goes over stdin, not argv.
token="${CLOUDFLARE_API_TOKEN:-}"
if [ -z "$token" ] && [ -r "$app/.env" ]; then token="$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' "$app/.env" | tr -d '\r"')"; fi
incomplete=0
cf_delete() { # $1 = API path
  if [ "$dry" = 1 ]; then printf '[dry-run] cloudflare DELETE %s\n' "$1"; return 0; fi
  printf '==> cloudflare DELETE %s\n' "$1"
  local code
  code="$(printf 'header = "Authorization: Bearer %s"\n' "$token" |
    curl --config - --silent --show-error --max-time 30 --output /dev/null --write-out '%{http_code}' --request DELETE "https://api.cloudflare.com/client/v4$1")" || code=000
  case "$code" in
    2?? | 404) return 0 ;;
  esac
  say "Cloudflare answered HTTP $code"
  return 1
}
cf_delete_tunnel() { # cloudflared connections can linger for a moment after cvs-tunnel stops, so try a few times
  local i
  for i in 1 2 3 4; do
    cf_delete "$1" && return 0
    [ "$i" = 4 ] || sleep "${CVS_RETRY_SLEEP:-5}"
  done
  return 1
}
if [ -n "$dns_id" ] || [ -n "$tunnel_id" ]; then
  if [ -z "$token" ] && [ "$dry" = 0 ]; then
    say "warning: CLOUDFLARE_API_TOKEN is not set; the DNS record ${dns_id:-none} and tunnel ${tunnel_id:-none} stay in Cloudflare and in $state_file"
    incomplete=1
  else
    if [ -n "$dns_id" ] && [ -n "$zone_id" ]; then
      if cf_delete "/zones/$zone_id/dns_records/$dns_id"; then
        drop "dns_record_id=$dns_id"
        drop "zone_id=$zone_id"
      else
        say "warning: deleting DNS record $dns_id failed"
        incomplete=1
      fi
    fi
    if [ -n "$tunnel_id" ] && [ -n "$account_id" ]; then
      if cf_delete_tunnel "/accounts/$account_id/cfd_tunnel/$tunnel_id"; then
        drop "tunnel_id=$tunnel_id"
        drop "account_id=$account_id"
      else
        say "warning: deleting tunnel $tunnel_id failed"
        incomplete=1
      fi
    fi
  fi
fi

# 5. The state file itself once everything is undone.
if [ "$incomplete" = 1 ]; then
  fail "not everything was removed; $state_file is kept (with what is left) so this script can be run again"
fi
run rm -f "$state_file"
if [ "$dry" = 1 ]; then
  say "dry run: nothing was changed. A real run removes the cvs-* units and the Cloudflare tunnel and DNS record; the compose volumes, $app and the backups stay"
else
  say "done: the cvs-* units are gone; the compose volumes, $app and the backups are untouched"
fi
