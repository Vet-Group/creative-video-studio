#!/usr/bin/env bash
# D.5, owner step: write /opt/creative-video-studio/.env on vet-linux, which the gate key cannot do. Like A.0c it uses the
# owner's vet-linux profile, so the owner runs it (or tells the coordinating session to). Plan D.5: the VET .env holds only
# the names in .env.example, copied value by value from this checkout's .env, so FAL_ADMIN_KEY never reaches VET.
# APP_URL becomes the public hostname; BETTER_AUTH_SECRET is kept from the VET .env when there is one, else a new one is made.
# It also prepares the app directory as a git checkout with the right origin, so the gate's `deploy` fetches instead of
# cloning into a non-empty directory. Values are never printed; only the names are.
#   bash scripts/run/provision-vet-env.sh             write the file on VET
#   bash scripts/run/provision-vet-env.sh --dry-run   build it locally and print the names, without ssh
# CVS_ENV_FILE (default: this checkout's .env) is the file the values come from.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP=/opt/creative-video-studio
REPO=git@github.com:anhtahaylove/creative-video-studio.git
ENV_FILE="${CVS_ENV_FILE:-$ROOT/.env}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

(
  umask 077
  node -e '
    const fs = require("fs"), crypto = require("crypto");
    const names = (f) => fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l)).map((l) => l.slice(0, l.indexOf("=")));
    const local = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    const over = { APP_URL: "https://video.vetgroup.net", BETTER_AUTH_SECRET: crypto.randomBytes(32).toString("base64url") };
    const lines = names(process.argv[1]).map((k) => `${k}=${over[k] ?? local[k] ?? ""}`);
    if (lines.some((l) => l.startsWith("FAL_ADMIN_KEY="))) { console.error("FAL_ADMIN_KEY is in .env.example; refusing"); process.exit(1); }
    fs.writeFileSync(process.argv[3], lines.join("\n") + "\n", { mode: 0o600 });
  ' "$ROOT/.env.example" "$ENV_FILE" "$tmp/vet.env"
)
echo "names: $(cut -d= -f1 "$tmp/vet.env" | tr '\n' ' ')"
echo "empty: $(grep -E '^[A-Z_0-9]+=$' "$tmp/vet.env" | cut -d= -f1 | tr '\n' ' ')"
if [[ "${1:-}" == --dry-run ]]; then echo "dry run: nothing was sent"; exit 0; fi
[[ $# -eq 0 ]] || { echo "usage: provision-vet-env.sh [--dry-run]" >&2; exit 2; }

env -u CVS_RUN_DIR node "$ROOT/scripts/run/cli.ts" guard-check || exit 3
# shellcheck disable=SC2087 # $APP and $REPO are meant to expand here; the file arrives on stdin
ssh vet-linux "bash -s" <<EOF
set -euo pipefail
umask 077
mkdir -p $APP
if [ ! -d $APP/.git ]; then git -C $APP init -q && git -C $APP remote add origin $REPO; fi
[ "\$(git -C $APP remote get-url origin)" = "$REPO" ] || { echo "$APP has another origin; refusing" >&2; exit 1; }
cat > $APP/.env.new <<'ENVFILE'
$(cat "$tmp/vet.env")
ENVFILE
if [ -f $APP/.env ] && old="\$(grep -m1 '^BETTER_AUTH_SECRET=.' $APP/.env)"; then
  awk -v old="\$old" '/^BETTER_AUTH_SECRET=/ { print old; next } { print }' $APP/.env.new > $APP/.env.tmp && mv $APP/.env.tmp $APP/.env.new
  echo "kept the BETTER_AUTH_SECRET already on VET"
fi
chmod 600 $APP/.env.new
mv $APP/.env.new $APP/.env
n="\$(grep -c '^FAL_ADMIN_KEY=' $APP/.env || true)"
[ "\$n" = 0 ] || { echo "FAL_ADMIN_KEY reached VET; removing the file" >&2; rm -f $APP/.env; exit 1; }
echo "wrote $APP/.env (mode \$(stat -c %a $APP/.env), \$(grep -c '=' $APP/.env) names, FAL_ADMIN_KEY lines: \$n)"
EOF
