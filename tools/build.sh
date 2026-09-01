#!/usr/bin/env bash
# Build installable artifacts into dist/.
#   dist/claude-counter-<version>.zip  -> Chrome/Edge/Chromium (drag onto chrome://extensions)
#   dist/claude-counter-<version>.xpi  -> Firefox (see MAINTAINING.md re: signing)
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
OUT="dist"
NAME="claude-counter-${VERSION}"

rm -rf "$OUT"; mkdir -p "$OUT"

# Ship only what the extension actually loads. Everything else (docs, tools,
# userscript, screenshot) is repo furniture and would just bloat the package.
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -r manifest.json icons src LICENSE THIRD_PARTY_NOTICES.md "$STAGE/"

( cd "$STAGE" && zip -qr "$OLDPWD/$OUT/${NAME}.zip" . -x '.*' )
cp "$OUT/${NAME}.zip" "$OUT/${NAME}.xpi"

echo "built:"
ls -lh "$OUT" | tail -n +2 | awk '{printf "  %-34s %s\n", $9, $5}'
