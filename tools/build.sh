#!/usr/bin/env bash
# Build installable artifacts into dist/.
#   dist/claude-counter-<version>.zip  -> Chrome/Edge/Chromium (drag onto chrome://extensions)
#
# No .xpi is produced. Renaming the zip does not make a Firefox add-on: release
# Firefox hard-refuses unsigned extensions, so the file only ever failed to
# install. Firefox users load the unpacked zip via about:debugging instead.
# See MAINTAINING.md.
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

echo "built:"
ls -lh "$OUT" | tail -n +2 | awk '{printf "  %-34s %s\n", $9, $5}'
