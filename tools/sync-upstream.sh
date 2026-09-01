#!/usr/bin/env bash
# Show (and optionally merge) what upstream she-llac/claude-counter has added
# since we last synced. Upstream is effectively dormant -- last push 2026-03-21,
# 14 open PRs unmerged -- so expect this to report nothing most of the time.
#
#   ./tools/sync-upstream.sh          # report only
#   ./tools/sync-upstream.sh --merge  # report, then merge upstream/main
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch --quiet upstream

AHEAD=$(git rev-list --count upstream/main..HEAD)
BEHIND=$(git rev-list --count HEAD..upstream/main)

echo "fork  is $AHEAD commit(s) ahead of upstream/main"
echo "fork  is $BEHIND commit(s) behind upstream/main"

if [ "$BEHIND" -eq 0 ]; then
	echo "nothing new upstream."
	exit 0
fi

echo
echo "new upstream commits:"
git log --oneline HEAD..upstream/main | sed 's/^/  /'

echo
echo "files they touch that we have also modified (conflict candidates):"
UPSTREAM_FILES=$(git diff --name-only HEAD...upstream/main)
OURS=$(git diff --name-only upstream/main...HEAD)
comm -12 <(echo "$UPSTREAM_FILES" | sort) <(echo "$OURS" | sort) | sed 's/^/  /' || true

if [ "${1:-}" = "--merge" ]; then
	echo
	echo "merging upstream/main..."
	git merge --no-edit upstream/main
	echo "merged. re-run ./tools/build.sh and re-test on claude.ai before releasing."
fi
