#!/usr/bin/env bash
# Bootstrap a Vite project once, copy it into 8 sibling dirs, run
# `specnaut init --here --ai <harness>` on each, then print an inspect summary
# per harness. Useful for eyeballing layout differences across harnesses.
# Usage: compare-harnesses.sh <name>
set -euo pipefail

NAME="${1:?usage: compare-harnesses.sh <name>}"
. "$(dirname "$0")/_common.sh"
HARNESSES=(claude cursor codex gemini windsurf copilot opencode antigravity)

bash "$SMOKE_DIR/bootstrap-vite.sh" "$NAME"

for h in "${HARNESSES[@]}"; do
  variant="$NAME-$h"
  rm -rf "$CLI/sandbox/$variant"
  cp -R "$CLI/sandbox/$NAME" "$CLI/sandbox/$variant"
  echo
  echo "=== init --ai $h ==="
  bash "$SMOKE_DIR/run-init.sh" "$variant" "$h"
done

echo
echo "=== layout summaries ==="
for h in "${HARNESSES[@]}"; do
  bash "$SMOKE_DIR/inspect.sh" "$NAME-$h"
done
