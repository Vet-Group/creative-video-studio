#!/usr/bin/env bash
# The only way the run reaches VET (plan A.0): bash scripts/run/vet.sh <verb> [args]. Uses the run's own gate key, never the
# owner's vet-linux profile; the server side (cvs-run-gate) enforces the same verb list. Checks the guard hashes first and
# writes .omc/run/logs/vet-<verb>-<ts>.log ending in "EXIT <code>" for evidence.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEY="${CVS_GATE_KEY:-$HOME/.ssh/cvs_run_gate_ed25519}"
# Production moved to vet-server-new on 2026-11-01; auto-System-Product-Name is the fenced old host.
HOST="${CVS_VET_HOST:-vet-server-new.local}"
VERB="${1:-}"

case "$VERB" in
  check | sample-neighbours | fetch-inputs | deploy | status | backup | drill | uninstall) ;;
  *) echo "vet.sh: unknown verb '$VERB'" >&2; exit 2 ;;
esac
for a in "$@"; do
  [[ "$a" =~ ^[A-Za-z0-9._/:-]+$ ]] || { echo "vet.sh: refused argument" >&2; exit 2; }
done

env -u CVS_RUN_DIR node "$ROOT/scripts/run/cli.ts" guard-check || exit 3
[[ -f "$KEY" ]] || { echo "vet.sh: gate key missing; run A.0c first" >&2; exit 2; }

mkdir -p "$ROOT/.omc/run/logs"
LOGFILE="$ROOT/.omc/run/logs/vet-$VERB-$(date -u +%Y%m%dT%H%M%SZ).log"
# fetch-inputs cat streams image bytes to stdout, so it is not copied into the log.
if [[ "$VERB" == fetch-inputs && "${2:-}" == cat ]]; then
  ssh -F none -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=15 "root@$HOST" "$*"
  code=$?
  echo "fetch-inputs cat $3" >"$LOGFILE"
else
  ssh -F none -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=15 "root@$HOST" "$*" 2>&1 | tee "$LOGFILE"
  code=${PIPESTATUS[0]}
fi
echo "EXIT $code" >>"$LOGFILE"
exit "$code"
