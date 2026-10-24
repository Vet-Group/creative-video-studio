#!/usr/bin/env bash
# Usage: status.sh   (cvs-run-gate verb `status`; read-only)
# Prints the cvs-* units, the compose project's containers, the public hostname's answer and the last backup log line.
set -uo pipefail
uid="$(id -u)"
export HOME="${CVS_ROOT_HOME:-/root}" XDG_RUNTIME_DIR="/run/user/$uid"
app="${CVS_APP_DIR:-/opt/creative-video-studio}"
echo "commit $(git -C "$app" rev-parse --short HEAD 2> /dev/null || echo '?')"
systemctl --user list-units 'cvs-*' --all --no-pager --plain --no-legend
(cd "$app" && docker compose -p creative-video-studio ps --format '{{.Name}}\t{{.Status}}')
curl -s -o /dev/null -m 15 -w 'https://video.vetgroup.net/privacy %{http_code}\n' https://video.vetgroup.net/privacy
tail -n 1 "$HOME/.local/state/creative-video-studio/backup.log" 2> /dev/null || echo 'no backup log yet'
