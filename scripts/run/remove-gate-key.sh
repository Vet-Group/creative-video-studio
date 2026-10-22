#!/usr/bin/env bash
# A.2: remove exactly the run's gate line from vet-linux's authorized_keys; every other line must stay byte-identical.
#   bash scripts/run/remove-gate-key.sh                       real removal through the owner's vet-linux profile
#   bash scripts/run/remove-gate-key.sh --file F --pubkey P   dry run on a local authorized_keys copy (tests)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEY="$HOME/.ssh/cvs_run_gate_ed25519"

# Drops every line carrying the key blob (field 2 of the .pub file); refuses unless exactly one line goes.
remove_gate_line() {
  local f="$1" blob="$2" bak tmp before after
  bak="$f.root.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$f" "$bak"
  tmp="$(mktemp)"
  grep -vF " $blob" "$f" >"$tmp" || true
  before=$(grep -c '' "$f")
  after=$(grep -c '' "$tmp" || true)
  if [[ "$after" -ne $((before - 1)) ]]; then
    rm -f "$tmp"
    echo "expected exactly one gate line, found $((before - after)); nothing changed" >&2
    return 1
  fi
  cat "$tmp" >"$f"
  rm -f "$tmp"
  echo "removed 1 line (backup $bak)"
}

if [[ "${1:-}" == --file ]]; then
  [[ $# -eq 4 && "$3" == --pubkey ]] || { echo "usage: --file F --pubkey P" >&2; exit 2; }
  remove_gate_line "$2" "$(cut -d' ' -f2 "$4")"
  exit 0
fi

# Removal is a clean-up, so an expired pre-approval (exit 4) does not block it; a changed guard file (exit 3) does.
rc=0; env -u CVS_RUN_DIR node "$ROOT/scripts/run/cli.ts" guard-check || rc=$?
[[ $rc -eq 0 || $rc -eq 4 ]] || exit 3
blob="$(cut -d' ' -f2 "$KEY.pub")"
{ declare -f remove_gate_line; printf 'remove_gate_line /root/.ssh/authorized_keys %q\n' "$blob"; } | ssh vet-linux 'bash -s'
echo "gate key removed; /usr/local/sbin/cvs-run-gate stays inert without it"
