#!/usr/bin/env bash
# Usage: uninstall.sh [--dry-run]
# Undoes install.sh using only what <app>/install.state recorded (docs/ops/deploy.md):
#   - disables and removes the recorded cvs-* units (a state line that names any other unit makes it refuse);
#   - runs `docker compose -p creative-video-studio down`, which KEEPS the volumes (never -v);
#   - deletes the DNS record and the tunnel by their recorded ids (needs CLOUDFLARE_API_TOKEN), then the recorded files.
# It never touches other units, other compose projects, or Ideas Hub / POD Studio paths. The app directory, the data
# volumes and the backups stay. --dry-run prints every command, changes nothing and exits 0 when the state file is valid.
# Env (defaults): CVS_APP_DIR (/opt/creative-video-studio), CLOUDFLARE_API_TOKEN (else read from <app>/.env).
set -euo pipefail

project=creative-video-studio

dry=0
case "${1:-}" in
  --dry-run) dry=1 ;;
  "") ;;
  -h | --help) awk 'NR > 1 { if (/^#/) print; else exit }' "$0"; exit 0 ;;
  *) awk 'NR > 1 { if (/^#/) print; else exit }' "$0" >&2; exit 2 ;;
esac

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
done
if [ ${#units[@]} -gt 0 ]; then run systemctl --user daemon-reload; fi

# 2. This compose project only; no -v, so the data volumes stay.
run docker compose -p "$project" down

# 3. Cloudflare, by the recorded ids only.
token="${CLOUDFLARE_API_TOKEN:-}"
if [ -z "$token" ] && [ -r "$app/.env" ]; then token="$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' "$app/.env" | tr -d '\r"')"; fi
incomplete=0
cf_delete() { # $1 = API path; the token goes over stdin, not argv
  if [ "$dry" = 1 ]; then printf '[dry-run] cloudflare DELETE %s\n' "$1"; return 0; fi
  printf '==> cloudflare DELETE %s\n' "$1"
  printf 'header = "Authorization: Bearer %s"\n' "$token" |
    curl --config - --silent --show-error --fail --max-time 30 --request DELETE "https://api.cloudflare.com/client/v4$1" > /dev/null
}
if [ -n "$dns_id" ] || [ -n "$tunnel_id" ]; then
  if [ -z "$token" ] && [ "$dry" = 0 ]; then
    say "warning: CLOUDFLARE_API_TOKEN is not set; the DNS record ${dns_id:-none} and tunnel ${tunnel_id:-none} stay in Cloudflare and in $state_file"
    incomplete=1
  else
    if [ -n "$dns_id" ] && [ -n "$zone_id" ]; then
      cf_delete "/zones/$zone_id/dns_records/$dns_id" || { say "warning: deleting DNS record $dns_id failed"; incomplete=1; }
    fi
    if [ -n "$tunnel_id" ] && [ -n "$account_id" ]; then
      cf_delete "/accounts/$account_id/cfd_tunnel/$tunnel_id" || { say "warning: deleting tunnel $tunnel_id failed"; incomplete=1; }
    fi
  fi
fi

# 4. Recorded files, then the state file itself once everything is undone.
if [ ${#files[@]} -gt 0 ]; then run rm -f "${files[@]}"; fi
if [ "$incomplete" = 1 ]; then
  fail "not everything was removed; $state_file is kept so this script can be run again"
fi
run rm -f "$state_file"
say "done: the cvs-* units are gone; the compose volumes, $app and the backups are untouched"
