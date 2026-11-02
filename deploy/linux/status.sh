#!/usr/bin/env bash
# Usage: status.sh   (cvs-run-gate verb `status`; read-only)
# Prints the cvs-* units, the compose project's containers, the public hostname's answer, the last backup log line and speed figures (perf lines).
set -uo pipefail
uid="$(id -u)"
export HOME="${CVS_ROOT_HOME:-/root}" XDG_RUNTIME_DIR="/run/user/$uid"
app="${CVS_APP_DIR:-/opt/creative-video-studio}"
echo "commit $(git -C "$app" rev-parse --short HEAD 2> /dev/null || echo '?')"
systemctl --user list-units 'cvs-*' --all --no-pager --plain --no-legend
(cd "$app" && docker compose -p creative-video-studio ps --format '{{.Name}}\t{{.Status}}')
curl -s -o /dev/null -m 15 -w 'https://video.vetgroup.net/privacy %{http_code}\n' https://video.vetgroup.net/privacy
tail -n 1 "$HOME/.local/state/creative-video-studio/backup.log" 2> /dev/null || echo 'no backup log yet'
# Speed, read-only (owner, 2026-11-02): where a slow page comes from. The app answering on the server itself, the same page and a static file
# through the tunnel (the query keeps any cache out of it), the server's own line to Cloudflare both ways, and the tunnel's protocol and edge.
t() { curl -s -o /dev/null -m 20 -w "$1 %{http_code} ttfb %{time_starttransfer}s total %{time_total}s %{size_download}B %{speed_download}B/s\n" "${@:2}" || echo "$1 failed"; }
echo "perf cpu $(nproc) load $(cut -d' ' -f1-3 /proc/loadavg) mem $(free -m | awk '/Mem:/ {print $3 "/" $2 " MB used"}')"
t 'perf local /login' http://127.0.0.1:3400/login
t 'perf tunnel /login' https://video.vetgroup.net/login
chunk="$(find "$app/apps/web/.next/static/chunks" -maxdepth 1 -name '*.js' -printf '%s %f\n' 2> /dev/null | sort -rn | head -n 1 | cut -d' ' -f2)"
if [ -n "$chunk" ]; then
  t 'perf local static' "http://127.0.0.1:3400/_next/static/chunks/$chunk"
  t 'perf tunnel static' "https://video.vetgroup.net/_next/static/chunks/$chunk?perf=$(date +%s%N)"
fi
t 'perf cloudflare down 10MB' 'https://speed.cloudflare.com/__down?bytes=10000000'
head -c 5000000 /dev/zero | curl -s -o /dev/null -m 20 -w 'perf cloudflare up 5MB %{http_code} total %{time_total}s %{speed_upload}B/s\n' --data-binary @- https://speed.cloudflare.com/__up || echo 'perf cloudflare up failed'
journalctl --user -u cvs-tunnel.service --since '-7 days' --no-pager 2> /dev/null | grep -oE '(protocol|location)=[A-Za-z0-9]+' | sort | uniq -c | sed 's/^ */perf tunnel /'
