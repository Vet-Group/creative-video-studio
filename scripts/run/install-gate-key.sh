#!/usr/bin/env bash
# A.0c: give the run its own SSH key on vet-linux, restricted to the cvs-run-gate forced command. The only step that uses
# the owner's vet-linux profile. Also creates the read-only GitHub deploy key on VET.
#   bash scripts/run/install-gate-key.sh                       real install (needs a valid pre-approval)
#   bash scripts/run/install-gate-key.sh --file F --pubkey P   dry run on a local authorized_keys copy (tests)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEY="$HOME/.ssh/cvs_run_gate_ed25519"
OPTS='command="/usr/local/sbin/cvs-run-gate",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding'

# Appends exactly one line; every original byte must be unchanged afterwards, else the backup is restored.
append_gate_line() {
  local f="$1" line="$2" bak size before after
  bak="$f.root.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$f" "$bak"
  if grep -qxF "$line" "$f"; then echo "gate line already present"; return 0; fi
  size=$(wc -c <"$f")
  before=$(grep -c '' "$f" || true)
  if [[ -s "$f" && -n "$(tail -c1 "$f")" ]]; then printf '\n' >>"$f"; fi
  printf '%s\n' "$line" >>"$f"
  after=$(grep -c '' "$f")
  if ! cmp -s -n "$size" "$f" "$bak" || [[ "$after" -ne $((before + 1)) ]] || [[ "$(grep -cxF "$line" "$f")" -ne 1 ]]; then
    cat "$bak" >"$f"
    echo "append check failed; restored $bak" >&2
    return 1
  fi
  echo "appended 1 line (backup $bak)"
}

if [[ "${1:-}" == --file ]]; then
  [[ $# -eq 4 && "$3" == --pubkey ]] || { echo "usage: --file F --pubkey P" >&2; exit 2; }
  append_gate_line "$2" "$OPTS $(cat "$4")"
  exit 0
fi

env -u CVS_RUN_DIR node "$ROOT/scripts/run/cli.ts" guard-check || exit 3
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N '' -C cvs-run-gate -f "$KEY"
line="$OPTS $(cat "$KEY.pub")"

ssh vet-linux 'install -m 0755 /dev/stdin /usr/local/sbin/cvs-run-gate' <"$ROOT/deploy/linux/cvs-run-gate"
remote_sum=$(ssh vet-linux 'sha256sum /usr/local/sbin/cvs-run-gate' | cut -d' ' -f1)
[[ "$remote_sum" == "$(sha256sum "$ROOT/deploy/linux/cvs-run-gate" | cut -d' ' -f1)" ]] || { echo "gate upload mismatch" >&2; exit 1; }
{ declare -f append_gate_line; printf 'append_gate_line /root/.ssh/authorized_keys %q\n' "$line"; } | ssh vet-linux 'bash -s'

# Read-only deploy key: generated on VET, so the private half never leaves it.
pub=$(ssh vet-linux 'test -f /root/.ssh/cvs_deploy_ed25519 || ssh-keygen -q -t ed25519 -N "" -C cvs-deploy -f /root/.ssh/cvs_deploy_ed25519; cat /root/.ssh/cvs_deploy_ed25519.pub')
if ! gh repo deploy-key list --repo anhtahaylove/creative-video-studio | grep -q 'vet-linux'; then
  printf '%s\n' "$pub" | gh repo deploy-key add - --repo anhtahaylove/creative-video-studio --title vet-linux
fi

# Prove the gate works through the new key, and that it refuses everything else.
bash "$ROOT/scripts/run/vet.sh" check >/dev/null || { echo "gate key cannot run check" >&2; exit 1; }
if ssh -F none -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o BatchMode=yes "root@auto-System-Product-Name.local" 'id' 2>/dev/null; then
  echo "gate did not refuse an arbitrary command" >&2
  exit 1
fi
echo "gate key installed"
