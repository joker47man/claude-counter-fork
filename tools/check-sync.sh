#!/usr/bin/env bash
# The userscript is a hand-maintained concatenation of src/, not a build output,
# so a fix applied to src/ can silently miss it -- and the userscript users get a
# version that is still broken. Compare the parts that matter.
#
# Exits non-zero if src/ and the userscript have drifted.
set -uo pipefail
cd "$(dirname "$0")/.."

US=userscript/claude-counter.user.js
fail=0

# Compare a brace-balanced block starting at the first line matching $2.
extract() {
	awk -v pat="$2" '
		index($0, pat) && !started { started=1 }
		started {
			print
			n = gsub(/{/, "{"); m = gsub(/}/, "}")
			depth += n - m
			if (depth <= 0 && seen) exit
			if (n > 0) seen = 1
		}
	' "$1"
}

check() {
	local label="$1" pat="$2" srcfile="$3"
	local a b
	a=$(extract "$srcfile" "$pat" | sed 's/[[:space:]]//g')
	b=$(extract "$US" "$pat" | sed 's/[[:space:]]//g')
	if [ -z "$a" ]; then echo "  ?? $label: not found in $srcfile"; fail=1; return; fi
	if [ -z "$b" ]; then echo "  !! $label: MISSING from userscript"; fail=1; return; fi
	if [ "$a" = "$b" ]; then
		echo "  ok $label"
	else
		echo "  !! $label: DRIFTED between $srcfile and $US"
		fail=1
	fi
}

echo "src/ vs $US:"
check "CC.DOM selectors"  "CC.DOM = Object.freeze"  src/content/constants.js
check "attachHeader()"    "attachHeader() {"        src/content/ui.js
check "attachUsageLine()" "attachUsageLine() {"     src/content/ui.js

# Versions are independent strings but must be bumped together.
MV=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
UV=$(grep -m1 '@version' "$US" | awk '{print $NF}' | sed 's/-userscript$//')
if [ "$MV" = "$UV" ]; then
	echo "  ok version ($MV)"
else
	echo "  !! version: manifest=$MV userscript=$UV"
	fail=1
fi

[ "$fail" -eq 0 ] && echo "in sync." || echo "DRIFT DETECTED -- mirror the change into $US"
exit "$fail"
