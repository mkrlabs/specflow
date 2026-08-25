#!/usr/bin/env bash
# Run `specnaut init --here --no-git --ai <harness>` against sandbox/<name>/ using
# the current source tree (deno run on src/main.ts) — NOT the installed binary.
# That way you're validating what's on the working branch.
# Usage: run-init.sh <name> <harness>
set -euo pipefail

NAME="${1:?usage: run-init.sh <name> <harness>}"
HARNESS="${2:?usage: run-init.sh <name> <harness>}"
. "$(dirname "$0")/_common.sh"
SANDBOX_DIR="$CLI/sandbox/$NAME"

if [ ! -d "$SANDBOX_DIR" ]; then
  echo "error: sandbox/$NAME does not exist — run bootstrap-vite.sh or bootstrap-empty.sh first" >&2
  exit 1
fi

cd "$SANDBOX_DIR"
deno run --allow-all "$CLI/src/main.ts" init --here --no-git --ai "$HARNESS"
